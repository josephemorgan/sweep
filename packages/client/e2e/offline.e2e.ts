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
});

test.describe('with the service worker', () => {
  // The suite blocks service workers (playwright.config.ts); this check needs the real one.
  test.use({ serviceWorkers: 'allow' });

  test('keeps the self-hosted display font after an offline reload', async ({
    page,
    context,
    runs,
  }, testInfo) => {
    // Review Focus 1, R10: fonts are in the ngsw app group, so they load offline.
    const runId = await runs.create(`Offline font ${testInfo.project.name}`);
    await page.goto(`/runs/${runId}`);
    await expect(routeRow(page, 'Harrow Village')).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
        timeout: 30_000,
      })
      .toBe(true);

    await context.setOffline(true);
    await page.reload();
    const loaded = await page.evaluate(async () => {
      const faces = await document.fonts.load("600 17px 'Bricolage Grotesque'");
      return faces.length > 0 && faces.every((f) => f.status === 'loaded');
    });
    expect(loaded).toBe(true);
    await context.setOffline(false);
  });
});
