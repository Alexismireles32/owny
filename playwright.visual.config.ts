import { defineConfig } from '@playwright/test';

const port = 6006;

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
    },
  },
  webServer: {
    command:
      'npm run build-storybook && npx http-server storybook-static -p 6006 -a 127.0.0.1 -s',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240 * 1000,
  },
});
