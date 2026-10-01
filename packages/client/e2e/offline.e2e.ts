import { expect, leafPanel, routeRow, test } from './support/fixtures';

test('checks a task offline and syncs on reconnect', async ({ page, context, runs }, testInfo) => {
  const runId = await runs.create(`Offline ${testInfo.project.name}`);
  await page.goto(`/runs/${runId}`);
  const village = leafPanel(page, 'Harrow Village');
  await expect(routeRow(page, 'Harrow Village')).toHaveAttribute('data-state', 'current');

  await context.setOffline(true);
  await village.getByRole('checkbox', { name: 'Pay the ferryman' }).check();
  await expect(
    village.locator('[data-category-header]').filter({ hasText: 'Story' }),
  ).toContainText('1 of 1');
  await expect(page.getByText('1 unsaved', { exact: true })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('1 unsaved', { exact: true })).toHaveCount(0);
  await expect
    .poll(async () => {
      const res = await page.request.get(`/api/runs/${runId}`);
      const body = (await res.json()) as { progress: { tasks: Record<string, string> } };
      return body.progress.tasks['ferry-passage'];
    })
    .toBe('done');
  await page.reload();
  await expect(
    leafPanel(page, 'Harrow Village').getByRole('checkbox', { name: 'Pay the ferryman' }),
  ).toBeChecked();

  // The self-hosted display face still loads after an offline reload, served by
  // the service worker (Review Focus 1, R10).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(routeRow(page, 'Harrow Village')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const bricolageLoaded = await page.evaluate(() =>
    [...document.fonts].some(
      (f) => f.family.replace(/["']/g, '') === 'Bricolage Grotesque' && f.status === 'loaded',
    ),
  );
  expect(bricolageLoaded).toBe(true);
  expect(await page.evaluate(() => document.fonts.check("600 17px 'Bricolage Grotesque'"))).toBe(
    true,
  );
  await context.setOffline(false);
});
