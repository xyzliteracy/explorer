import { defineConfig } from '@playwright/test';
export default defineConfig({
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  testDir: './tests/performance', testMatch: '*.spec.ts', workers: 1, timeout: 120000,
  use: { baseURL: 'http://127.0.0.1:5174', headless: true, channel: 'chrome', viewport: { width: 1100, height: 750 } },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort', url: 'http://127.0.0.1:5174', reuseExistingServer: true },
});
