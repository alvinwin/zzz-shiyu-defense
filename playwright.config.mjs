import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:4187', trace: 'retain-on-failure', launchOptions: executablePath ? { executablePath } : {} },
  webServer: { command: 'PORT=4187 node scripts/serve.mjs dist', port: 4187, reuseExistingServer: false },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
