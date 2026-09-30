import { expect, test } from '@playwright/test';
for (const mode of ['web']) {
  test(`${mode}: ten prepared GLBs, demand idle, camera upgrades and eviction`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const assets: string[] = [];
    page.on('response', response => { if (response.url().endsWith('.glb') && response.ok()) assets.push(response.url()); });
    await page.goto(`/tests/performance/index.html?mode=${mode}`);
    await page.waitForFunction(() => window.performanceTest?.snapshot(), { timeout: 10000 });
    // The generated corpus must exercise convention lookup, not explicit LODs.
    expect(await page.evaluate(() => window.performanceTest.full.renderNodes.every(node =>
      node.model?.source && !node.model.previewSource && !node.model.detailSource,
    ))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.performanceTest?.snapshot()?.assets?.ready ?? 0), { timeout: 90000 }).toBeGreaterThanOrEqual(10);
    await page.waitForTimeout(1500);
    await expect.poll(() => new Set(assets.filter(url => url.includes('.preview.glb'))).size).toBe(10);
    const first = await page.evaluate(() => window.performanceTest.snapshot());
    expect(first.frameloop).toBe('demand'); expect(first.dpr).toBeLessThanOrEqual(1.5); expect(first.triangles).toBeLessThanOrEqual(601000);
    await page.screenshot({ path: `test-results/${mode}-overview.png` });
    await page.waitForTimeout(1500);
    const idle = await page.evaluate(() => window.performanceTest.snapshot());
    expect(idle.frames - first.frames).toBeLessThanOrEqual(2);
    if (mode === 'web') await page.getByRole('combobox', { name: 'Rendering quality' }).selectOption('high');
    await page.evaluate(() => window.performanceTest.camera([.5, .8, 1.7], [.5, .5, .5]));
    await expect.poll(() => assets.some(url => url.includes('bed_lamp.detail.glb')), { timeout: 60000 }).toBe(true);
    await page.waitForTimeout(1000); await page.screenshot({ path: `test-results/${mode}-detail.png` });
    await page.evaluate(() => window.performanceTest.clear());
    await page.waitForTimeout(6500);
    const cleared = await page.evaluate(() => window.performanceTest.snapshot());
    expect(cleared.textures).toBeLessThanOrEqual(1);
    expect(cleared.assets.bytes).toBe(0);
    expect(cleared.geometries).toBeLessThan(20);
    await page.evaluate(() => window.performanceTest.restore());
    await expect.poll(() => page.evaluate(() => window.performanceTest.snapshot().textures), { timeout: 60000 }).toBeGreaterThan(1);
    expect(errors).toEqual([]);
    await test.info().attach('measurements', { body: JSON.stringify({ first, idle, cleared, assets }, null, 2), contentType: 'application/json' });
  });
}
test('mobile viewport stays bounded and renders all previews', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/performance/index.html?mode=web');
  await page.waitForFunction(() => window.performanceTest?.snapshot());
  await page.evaluate(() => window.performanceTest.camera([4.5, 5, 20], [4.5, .5, 1.5]));
  await page.waitForTimeout(10000);
  const result = await page.evaluate(() => window.performanceTest.snapshot());
  expect(result.triangles).toBeLessThanOrEqual(601000); expect(result.dpr).toBeLessThanOrEqual(1.5);
  await page.screenshot({ path: 'test-results/mobile-overview.png' });
});
test('all thirty generated GLBs decode and render within model budgets', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const loaded = new Set<string>(); page.on('response', response => { if (response.ok() && response.url().endsWith('.glb')) loaded.add(response.url()); });
  await page.goto('/tests/performance/index.html?mode=web');
  await page.waitForFunction(() => window.performanceTest?.snapshot());
  await page.waitForTimeout(500);
  await page.evaluate(() => window.performanceTest.camera([4.5, 5, 13], [4.5, .5, 1.5]));
  const measurements = [];
  for (const level of ['preview', 'standard', 'detail']) {
    await page.evaluate(level => window.performanceTest.level(level), level);
    await expect.poll(() => [...loaded].filter(url => url.endsWith(`.${level}.glb`)).length, { timeout: 90000 }).toBe(10);
    await expect.poll(() => page.evaluate(() => window.performanceTest.snapshot().assets.loading), { timeout: 90000 }).toBe(0);
    await page.waitForTimeout(1500);
    const result = await page.evaluate(() => window.performanceTest.snapshot());
    expect(result.assets.errors).toEqual([]); expect(result.assets.ready).toBe(10); expect(result.assets.bytes).toBeLessThanOrEqual(128 * 1024 * 1024); expect(result.triangles).toBeLessThanOrEqual(601000);
    if (level !== 'preview') expect(result.textures).toBeGreaterThan(1);
    await page.screenshot({ path: `test-results/all-${level}.png` });
    measurements.push({ level, ...result });
    // Exercise every asset on its own: aggregate scene admission may retain previews.
    for (let index = 0; index < 10; index++) {
      await page.evaluate(({ level, index }) => window.performanceTest.level(level, index), { level, index });
      await expect.poll(() => page.evaluate(() => window.performanceTest.snapshot().triangles)).toBeGreaterThan(1000);
      if (level !== 'preview') await expect.poll(() => page.evaluate(() => window.performanceTest.snapshot().textures)).toBeGreaterThan(1);
      expect((await page.evaluate(() => window.performanceTest.snapshot())).assets.errors).toEqual([]);
    }
  }
  expect(errors).toEqual([]);
  await test.info().attach('all-model-levels', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
});

test('quality choice persists and limits pixel ratio', async ({ page }) => {
  await page.goto('/tests/performance/index.html?mode=web');
  await page.getByRole('combobox', { name: 'Rendering quality' }).selectOption('low');
  await expect.poll(() => page.evaluate(() => window.performanceTest.snapshot()?.dpr)).toBe(1);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Rendering quality' })).toHaveValue('low');
  await expect.poll(() => page.evaluate(() => window.performanceTest.snapshot()?.dpr)).toBe(1);
});

test('only the selected bounding box loads an original, released on deselection', async ({ page }) => {
  const originals: string[] = [];
  await page.route('**/performance-models/*.glb', async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    if (/\.(preview|standard|detail)\.glb$/.test(name)) return route.continue();
    originals.push(name);
    // Serve the source corpus without adding originals to generated fixtures.
    await route.fulfill({ path: `../xyz-scene/glb_models/${name}`, contentType: 'model/gltf-binary' });
  });
  await page.goto('/tests/performance/index.html?mode=web');
  await expect.poll(() => page.evaluate(() => window.performanceTest?.snapshot()?.assets?.ready ?? 0), { timeout: 90000 }).toBeGreaterThanOrEqual(10);
  expect(originals).toEqual([]);
  await page.getByRole('combobox', { name: 'Rendering quality' }).selectOption('low');
  await page.evaluate(() => window.performanceTest.select(0));
  await expect.poll(() => page.evaluate(() => window.performanceTest.snapshot().original?.ready), { timeout: 60000 }).toBe(1);
  expect(originals).toEqual(['bed_lamp.glb']);
  expect(await page.evaluate(() => window.performanceTest.snapshot().original.triangles)).toBeGreaterThan(600000);
  await page.evaluate(() => window.performanceTest.select(1));
  await expect.poll(() => originals.length).toBe(2);
  await expect.poll(() => page.evaluate(() => window.performanceTest.snapshot().original?.ready), { timeout: 60000 }).toBe(1);
  expect(originals).toEqual(['bed_lamp.glb', 'ceiling_lamp.glb']);
  expect(await page.evaluate(() => window.performanceTest.snapshot().original.total)).toBe(1);
  await page.evaluate(() => window.performanceTest.select());
  await expect.poll(() => page.evaluate(() => window.performanceTest.snapshot().original.bytes)).toBe(0);
  expect(await page.evaluate(() => window.performanceTest.snapshot().original.total)).toBe(0);
});
