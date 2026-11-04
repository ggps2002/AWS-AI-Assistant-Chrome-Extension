import { defineConfig } from '@playwright/test';

// End-to-end tests load the built extension (dist/) into Chromium. Run with `npm run test:e2e`.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
});
