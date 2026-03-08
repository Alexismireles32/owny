import { defineConfig } from '@playwright/test';

const port = 3117;
const baseURL = `http://127.0.0.1:${port}`;
const rootDir = process.cwd();

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60 * 1000,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `cd ${rootDir} && env NEXT_PUBLIC_APP_URL=${baseURL} OWNY_FAKE_STRIPE=1 CRON_SECRET=e2e-cron-secret npm run build && env NEXT_PUBLIC_APP_URL=${baseURL} OWNY_FAKE_STRIPE=1 CRON_SECRET=e2e-cron-secret npx next start -H 127.0.0.1 -p ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 360 * 1000,
  },
});
