import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
const directory = process.env.LEPAPAYER_MODELS ?? '/Users/candid/Desktop/lepapayer-models';
test('iPhone Safari capability profile: bounded Pap upgrades through refresh and context recovery', async ({ page }) => {
  test.skip(!existsSync(directory), 'Set LEPAPAYER_MODELS to the local GLB folder');
  test.setTimeout(180000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', { value: undefined });
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 Version/26.6 Mobile/15E148 Safari/604.1' });
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 6 });
  });
  const errors: string[] = [], previews: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().endsWith('.preview.glb')) previews.push(request.url()); });
  await page.route('**/lepapayer/*.glb', async route => {
    const file = path.join(directory, path.basename(new URL(route.request().url()).pathname));
    await route.fulfill({ path: file, contentType: 'model/gltf-binary' });
  });
  const measurements = [];
  for (let refresh = 0; refresh < 3; refresh++) {
    if (!refresh) await page.goto('/tests/performance/index.html?scene=lepapayer');
    else await page.reload();
    await page.waitForFunction(() => window.performanceTest?.snapshot()?.assets?.ready >= 23);
    await expect(page.locator('[data-model-preparation]')).toHaveCount(0, { timeout: 90000 });
    const initial = await page.evaluate(() => window.performanceTest.snapshot());
    expect(initial.presentations).toHaveLength(26);
    expect(initial.presentations.every(model => model.meshes > 0)).toBe(true);
    for (let view = 0; view < 8; view++) {
      await page.getByRole('button', { name: 'Next view point', exact: true }).click();
      await page.waitForTimeout(150);
      const snapshot = await page.evaluate(() => window.performanceTest.snapshot());
      expect(snapshot.presentations.every(model => model.meshes > 0)).toBe(true);
      expect(snapshot.original.bytes).toBeLessThanOrEqual(160 * 1024 * 1024);
      expect(snapshot.assets.bytes + snapshot.original.bytes).toBeLessThanOrEqual(256 * 1024 * 1024);
      measurements.push({ refresh, view, baseline: snapshot.assets.bytes, originals: snapshot.original.bytes });
    }
  }
  await page.evaluate(() => { window.performanceTest.lostContext = window.performanceTest.context(); window.performanceTest.lostContext.loseContext(); });
  await expect(page.locator('[data-model-preparation]')).toHaveCount(1);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.performanceTest.lostContext.restoreContext());
  await expect(page.locator('[data-model-preparation]')).toHaveCount(0, { timeout: 30000 });
  const recovered = await page.evaluate(() => window.performanceTest.snapshot());
  expect(recovered.presentations.every(model => model.meshes > 0)).toBe(true);
  expect(errors).toEqual([]); expect(previews).toEqual([]);
  await test.info().attach('safari-refresh-resources', { body: JSON.stringify(measurements), contentType: 'application/json' });
});
