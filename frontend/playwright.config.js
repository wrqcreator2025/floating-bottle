import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: externalBaseUrl || 'http://127.0.0.1:5174',
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npm run dev -- --port 5174 --strictPort',
        url: 'http://127.0.0.1:5174',
        reuseExistingServer: true,
        timeout: 30000,
      },
});
