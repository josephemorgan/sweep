import type { Page } from '@playwright/test';
import { expect, leafPanel, metric, routeRow, test } from './support/fixtures';

// Screenshot baselines for the Route UI (plan C7, R6). Generated on Linux and committed under
// screens.e2e.ts-snapshots/. Regenerate with `pnpm e2e -- --update-snapshots screens`.

async function openSeededRun(page: Page, runs: { create(name: string): Promise<string> }) {
  // A fixed run name keeps the header identical across workers and projects.
  const runId = await runs.create('Screens');
  await page.goto(`/runs/${runId}`);
  await expect(routeRow(page, 'Harrow Village')).toHaveAttribute('data-state', 'current');
  await page.evaluate(() => document.fonts.ready);
}

test('run view', async ({ page, runs }) => {
  await openSeededRun(page, runs);
  await expect(routeRow(page, 'Harrow Village')).toBeInViewport();
  await expect(page).toHaveScreenshot('run-view.png', { fullPage: false });
});

test('clear sheet', async ({ page, runs }) => {
  await openSeededRun(page, runs);
  await leafPanel(page, 'Harrow Village').getByRole('button', { name: 'Clear section' }).click();
  const dialog = page.getByRole('dialog', { name: 'Leave Harrow Village behind?' });
  await expect(dialog.getByRole('button', { name: 'Stay here' })).toBeFocused();
  await expect(page).toHaveScreenshot('clear-sheet.png', { fullPage: false });
});

test('metric sheet', async ({ page, runs }) => {
  await openSeededRun(page, runs);
  const bar = page.getByRole('navigation', { name: 'Run metrics' });
  await metric(bar, 'Last chance', 1).click();
  const sheet = page.getByRole('dialog', { name: 'Last chance', exact: true });
  await expect(sheet.getByRole('heading', { name: 'Harrow Village' })).toBeVisible();
  await expect(page).toHaveScreenshot('metric-sheet.png', { fullPage: false });
});
