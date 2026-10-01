import { defineConfig } from '@playwright/test';
import { BASE_URL, serverEnv } from './e2e/support/e2e-env';

const ci = !!process.env['CI'];
// Escape hatch for distros where Playwright's bundled chromium lacks system libs.
const chromiumPath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'];

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  // Auth budget: the server's auth limiter allows 10 non-GET requests/min per IP (in memory, reset on
  // start). Worst case per run: each project's workers sign in once each (2 projects x workers)
  // plus the sign-in flow's 2 attempts per project (4) = 2w + 4 <= 8, so w = 2. A restarted worker
  // reuses its still-valid session (GET check), so failures and retries cost 0 auth POSTs.
  workers: 2,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : [['list']],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  use: {
    baseURL: BASE_URL,
    browserName: 'chromium',
    trace: 'on-first-retry',
    // The e2e build registers the real service worker; block it so page.route and offline
    // emulation see every request. The update prompt has a component test instead.
    serviceWorkers: 'block',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  // Spec §8: phone portrait is primary; a 4:3 landscape handheld must stay usable. handheld-4x3
  // models the Retroid (1280x960 screen at DPR 2, Chrome's URL bar leaves ~400px); ADR 0016.
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
      use: {
        viewport: { width: 640, height: 400 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
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
