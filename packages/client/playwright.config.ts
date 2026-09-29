import { defineConfig } from '@playwright/test';

const ci = !!process.env['CI'];
// Escape hatch for distros where Playwright's bundled chromium lacks system libs.
const chromiumPath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'];

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    browserName: 'chromium',
    trace: 'on-first-retry',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  // Spec §8: phone portrait is primary; a 4:3 landscape handheld must stay usable.
  projects: [
    {
      name: 'phone',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'handheld-4x3',
      use: { viewport: { width: 1024, height: 768 } },
    },
  ],
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:4200',
    reuseExistingServer: !ci,
    timeout: 120_000,
  },
});
