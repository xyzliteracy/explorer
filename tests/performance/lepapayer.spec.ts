import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
const directory = process.env.LEPAPAYER_MODELS ?? '/Users/candid/Desktop/lepapayer-models';
for (const mobile of [false, true]) {
  test(`Pap room: stable high quality through navigation (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    test.skip(!existsSync(directory), 'Set LEPAPAYER_MODELS to the local original/prepared GLB folder');
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(memory => {
      Object.defineProperty(navigator, 'deviceMemory', { value: memory });
      Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4 });
    }, mobile ? 4 : 8);
    const errors: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().endsWith('.glb')) requests.push(request.url()); });
    await page.route('**/lepapayer/*.glb', async route => {
      const file = path.join(directory, path.basename(new URL(route.request().url()).pathname));
      if (!existsSync(file)) return route.fulfill({ status: 404, body: 'missing local model' });
      return route.fulfill({ path: file, contentType: 'model/gltf-binary' });
    });
    await page.goto('/tests/performance/index.html?scene=lepapayer');
    await page.waitForFunction(() => window.performanceTest?.snapshot()?.assets);
    const counts = await page.evaluate(() => ({
      instances: window.performanceTest.full.renderNodes.filter(node => node.model).length,
      unique: new Set(window.performanceTest.full.renderNodes.flatMap(node => node.model ? [node.model.source] : [])).size,
    }));
    await expect.poll(() => page.evaluate(() => window.performanceTest.snapshot().assets.ready), { timeout: 90000 }).toBeGreaterThanOrEqual(counts.unique);
    await expect(page.locator('[data-model-preparation]')).toHaveCount(0, { timeout: 60000 });
    expect(new Set(requests).size).toBeGreaterThanOrEqual(counts.unique);
    expect(requests.some(url => url.endsWith('.preview.glb'))).toBe(false);
    if (!mobile) await page.getByRole('button', { name: /Start tour/ }).click();
    const first = await page.evaluate(() => window.performanceTest.snapshot());
    expect(first.presentations).toHaveLength(counts.instances);
    expect(first.presentations.every(model => model.meshes > 0)).toBe(true);
    const views = [];
    for (let index = 0; index < 4; index++) {
      await page.waitForTimeout(500);
      await expect(page.locator('[data-model-preparation]')).toHaveCount(0);
      const view = await page.evaluate(() => window.performanceTest.snapshot());
      expect(view.presentations.every(model => model.meshes > 0)).toBe(true);
      expect(view.assets.ready).toBeGreaterThanOrEqual(counts.unique);
      views.push(view);
      await page.screenshot({ path: `test-results/pap-${mobile ? 'mobile' : 'desktop'}-pov${index + 1}.png` });
      await page.getByRole('button', { name: mobile ? 'Next view point' : 'Next', exact: true }).click();
    }
    const pan = await page.evaluate(async () => {
      const measurements = [];
      let last = performance.now();
      for (let i = 0; i < 180; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const now = performance.now();
        const snapshot = window.performanceTest.snapshot();
        measurements.push({ models: snapshot.presentations, ms: now - last, ready: snapshot.assets.ready,
          missing: snapshot.presentations.filter(model => model.meshes === 0).length,
          preparing: Boolean(document.querySelector('[data-model-preparation]')) });
        last = now;
        window.performanceTest.camera([5.4, 2, 3.8], [5.4 + Math.sin(i / 180 * Math.PI * 4) * 4, 1.6, 3.8 - Math.cos(i / 180 * Math.PI * 4) * 4]);
      }
      return measurements;
    });
    expect(pan.every(frame => frame.ready >= counts.unique && frame.missing === 0 && !frame.preparing)).toBe(true);
    for (let i = 1; i < pan.length; i++) for (const previous of pan[i - 1].models) {
      const next = pan[i].models.find(model => model.id === previous.id);
      if (previous.pixels > 0 && next.pixels > 0 && previous.source && !previous.source.includes('.detail.glb')) {
        expect(next.source).toBe(previous.source);
      }
    }
    expect(new Set(requests).size).toBeGreaterThanOrEqual(counts.unique);
    await page.waitForTimeout(14500);
    await expect.poll(() => page.evaluate(() => window.performanceTest.snapshot().original?.loading ?? 0)).toBe(0);
    await page.waitForTimeout(300);
    const idle = await page.evaluate(() => window.performanceTest.snapshot());
    await page.waitForTimeout(1000);
    const resting = await page.evaluate(() => window.performanceTest.snapshot());
    expect(resting.frames - idle.frames).toBeLessThanOrEqual(2);
    // Returning to the bed after pressure and a cold interval must retain the
    // already verified original, not the aggressively simplified bed detail.
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: mobile ? 'Next view point' : 'Next', exact: true }).click();
    await page.waitForTimeout(500);
    const bed = await page.evaluate(() => window.performanceTest.snapshot().presentations.find(model => model.id.startsWith('Pap/Bed/')));
    const bedWasPromoted = [...views, ...pan.map(frame => ({ presentations: frame.models }))].some(view => view.presentations.some(model => model.id.startsWith('Pap/Bed/') && model.source?.endsWith('/bed.glb')));
    if (bedWasPromoted) expect(bed.source).toMatch(/\/bed.glb$/);
    else expect(bed.meshes).toBeGreaterThan(0);
    if (mobile) {
      expect(resting.original.bytes).toBeLessThanOrEqual(160 * 1024 * 1024);
      expect(resting.assets.bytes + resting.original.bytes).toBeLessThanOrEqual(256 * 1024 * 1024);
    }
    await page.screenshot({ path: `test-results/pap-${mobile ? 'mobile' : 'desktop'}-return-bed.png` });
    expect(errors).toEqual([]);
    await test.info().attach('pap-measurements', { body: JSON.stringify({ counts, first, views, pan, idle, resting, requests }, null, 2), contentType: 'application/json' });
  });
}

test('Pap room: compare original bedding and curtains at the same viewpoints', async ({ page }) => {
  test.skip(!existsSync(directory), 'Set LEPAPAYER_MODELS to the local GLB folder');
  await page.route('**/lepapayer/*.glb', async route => {
    const file = path.join(directory, path.basename(new URL(route.request().url()).pathname));
    return route.fulfill({ path: file, contentType: 'model/gltf-binary' });
  });
  await page.goto('/tests/performance/index.html?scene=lepapayer&original=bed,lounge_curtains');
  await expect.poll(() => page.evaluate(() => window.performanceTest?.snapshot()?.assets?.ready ?? 0), { timeout: 90000 }).toBeGreaterThanOrEqual(23);
  await expect(page.locator('[data-model-preparation]')).toHaveCount(0);
  await page.getByRole('button', { name: /Start tour/ }).click();
  for (let index = 0; index < 4; index++) {
    await page.waitForTimeout(500);
    if (index === 1 || index === 3) await page.screenshot({ path: `test-results/pap-original-pov${index + 1}.png` });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await test.info().attach('original-resource-comparison', { body: JSON.stringify(await page.evaluate(() => window.performanceTest.snapshot()), null, 2), contentType: 'application/json' });
});
