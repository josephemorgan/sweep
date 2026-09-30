import { defineConfig } from '@playwright/test';
import { BASE_URL, serverEnv, storageStatePath } from './e2e/support/e2e-env';

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
    baseURL: BASE_URL,
    browserName: 'chromium',
    trace: 'on-first-retry',
    // The e2e build registers the real service worker; block it so page.route and offline
    // emulation see every request. The update prompt has a component test instead.
    serviceWorkers: 'block',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  // Spec §8: phone portrait is primary; a 4:3 landscape handheld must stay usable.
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'phone',
      dependencies: ['setup'],
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        storageState: storageStatePath('phone'),
      },
    },
    {
      name: 'handheld-4x3',
      dependencies: ['setup'],
      use: {
        viewport: { width: 1024, height: 768 },
        storageState: storageStatePath('handheld-4x3'),
      },
    },
  ],
  // A fresh database and server per run: reset sweep_e2e, build the production client, serve it
  // from the real server on :3100. Reuse only when asked (SWEEP_E2E_REUSE=1) and never in CI.
  webServer: {
    command:
      'node e2e/support/reset-db.mts && pnpm run build && pnpm --filter @sweep/server exec tsx src/index.ts',
    url: `${BASE_URL}/api/health`,
    env: serverEnv(),
    reuseExistingServer: !ci && process.env['SWEEP_E2E_REUSE'] === '1',
    timeout: 300_000,
  },
});
