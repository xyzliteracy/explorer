import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
test('visual comparison against original scan', async ({ page }) => {
  test.skip(!existsSync('public/performance-originals/bed_lamp.glb'), 'Optional original comparison fixture not copied');
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/performance/compare.html');
  await page.waitForFunction(() => window.comparisonReady === 2, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/performance/original-vs-detail.png' });
  expect(errors).toEqual([]);
});
