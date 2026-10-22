import { expect, test } from '@playwright/test';
const fixture = '/tests/performance/index.html?mode=web';
const ready = async (page) => {
  await expect.poll(() => page.evaluate(() => window.performanceTest?.snapshot()?.assets?.ready ?? 0), { timeout: 90000 }).toBe(10);
  await expect(page.locator('[data-model-preparation]')).toHaveCount(0, { timeout: 60000 });
};
test('stable high-detail room: pan, selection, idle power and document disposal', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const requests: string[] = [];
  page.on('request', request => { if (request.url().endsWith('.glb')) requests.push(request.url()); });
  await page.goto(fixture); await ready(page);
  expect(requests).toHaveLength(10);
  expect(requests.every(url => url.endsWith('.detail.glb'))).toBe(true);
  const first = await page.evaluate(() => window.performanceTest.snapshot());
  expect(first.assets.errors).toEqual([]);
  expect(first.assets.triangles).toBeGreaterThan(600000);
  expect(first.assets.bytes).toBeLessThan(128 * 1024 * 1024);
  expect(first.frameloop).toBe('demand');
  await page.screenshot({ path: 'test-results/stable-overview.png' });
  await page.waitForTimeout(1500);
  const idle = await page.evaluate(() => window.performanceTest.snapshot());
  expect(idle.frames - first.frames).toBeLessThanOrEqual(2);
  for (const [position, target] of [
    [[.5, .8, 1.7], [.5, .5, .5]], [[4.5, 5, 13], [4.5, 5, 40]], [[4.5, 5, 13], [4.5, .5, 1.5]],
  ]) {
    await page.evaluate(({ position, target }) => window.performanceTest.camera(position, target), { position, target });
    await page.waitForTimeout(1000);
    expect((await page.evaluate(() => window.performanceTest.snapshot())).assets.ready).toBe(10);
    await expect(page.locator('[data-model-preparation]')).toHaveCount(0);
  }
  await page.evaluate(() => window.performanceTest.select(0));
  await page.evaluate(() => window.performanceTest.select());
  expect(requests).toHaveLength(10);
  await page.screenshot({ path: 'test-results/stable-return.png' });
  await page.evaluate(() => window.performanceTest.clear());
  await expect.poll(() => page.evaluate(() => window.performanceTest.snapshot().assets.bytes), { timeout: 10000 }).toBe(0);
  const cleared = await page.evaluate(() => window.performanceTest.snapshot());
  expect(cleared.textures).toBeLessThanOrEqual(1);
  expect(cleared.geometries).toBeLessThan(20);
  await page.evaluate(() => window.performanceTest.restore()); await ready(page);
  expect(errors).toEqual([]);
  await test.info().attach('measurements', { body: JSON.stringify({ first, idle, cleared, requests }, null, 2), contentType: 'application/json' });
});
test('failed models leave the scene usable and can be retried independently', async ({ page }) => {
  let fail = true;
  await page.route('**/performance-models/bed_lamp*.glb', async route => {
    if (fail) return route.fulfill({ status: 503, body: 'temporarily unavailable' });
    return route.continue();
  });
  await page.goto(fixture);
  await expect(page.getByText('Some models could not be loaded. You can keep exploring or retry.')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('[data-model-preparation]')).toHaveCount(0);
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.performanceTest.snapshot().assets.ready)).toBe(9);
  fail = false;
  await page.getByRole('button', { name: 'Retry models' }).click();
  await ready(page);
});
test('missing prepared detail falls back to original without exposing a preview', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().endsWith('.glb')) requests.push(request.url()); });
  await page.route('**/performance-models/bed_lamp.detail.glb', route => route.fulfill({ status: 404, body: 'missing prepared asset' }));
  await page.route('**/performance-models/bed_lamp.glb', route => route.fulfill({ path: 'public/performance-models/bed_lamp.detail.glb', contentType: 'model/gltf-binary' }));
  await page.goto(fixture); await ready(page);
  expect(requests.some(url => url.endsWith('/bed_lamp.glb'))).toBe(true);
  expect(requests.some(url => url.endsWith('.preview.glb'))).toBe(false);
});
test('ordinary mobile viewport retains high detail through rapid navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', { value: 4 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4 });
  });
  const requests: string[] = [];
  page.on('request', request => { if (request.url().endsWith('.glb')) requests.push(request.url()); });
  await page.goto(fixture); await ready(page);
  await page.evaluate(() => {
    for (let i = 0; i < 60; i++) window.performanceTest.camera([4.5, 5, 13], [Math.sin(i) * 10, .5, Math.cos(i) * 10]);
    window.performanceTest.camera([4.5, 5, 13], [4.5, .5, 1.5]);
  });
  await page.waitForTimeout(1000);
  expect(requests).toHaveLength(10);
  expect(requests.every(url => url.endsWith('.detail.glb'))).toBe(true);
  await expect(page.locator('[data-model-preparation]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/stable-mobile.png' });
});
test('only critical hardware uses a fixed preview set', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', { value: 1 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2 });
  });
  const requests: string[] = [];
  page.on('request', request => { if (request.url().endsWith('.glb')) requests.push(request.url()); });
  await page.goto(fixture); await ready(page);
  expect(requests).toHaveLength(10);
  expect(requests.every(url => url.endsWith('.preview.glb'))).toBe(true);
});

test('a delayed first GLB does not cover the scene or block a healthy later GLB', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let first: string | undefined;
  await page.route('**/performance-models/*.glb', async route => {
    const url = route.request().url();
    if (!first) first = url;
    if (url === first) await gate;
    await route.continue();
  });
  try {
    await page.goto(fixture);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('[data-model-preparation]')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.performanceTest?.snapshot()?.assets?.ready ?? 0)).toBeGreaterThan(0);
    const partial = await page.evaluate(() => window.performanceTest.snapshot());
    expect(partial.assets.ready).toBeLessThan(10);
    expect(partial.presentations.some(model => model.meshes > 0)).toBe(true);
    await page.evaluate(() => window.performanceTest.camera([4.5, 5, 13], [0, 0, 0]));
    // Recovery warms existing models without waiting for the still-stalled GLB.
    await page.evaluate(() => { window.performanceTest.lostContext = window.performanceTest.context(); window.performanceTest.lostContext.loseContext(); });
    await expect(page.locator('[data-model-preparation]')).toHaveCount(1);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.performanceTest.lostContext.restoreContext());
    await expect(page.locator('[data-model-preparation]')).toHaveCount(0);
  } finally { release(); }
  await ready(page);
});
