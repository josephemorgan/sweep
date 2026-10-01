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
  await expect(page.locator('app-unsaved-badge').getByRole('status')).toContainText(
    '1 unsaved change',
  );

  await context.setOffline(false);
  await expect(page.locator('app-unsaved-badge').getByRole('status')).not.toContainText('unsaved');
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
    test.setTimeout(90_000);
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
    // ngsw prefetches the app group asynchronously after activation; wait until every file of
    // it (shell, scripts, styles, fonts) is in Cache Storage before cutting the network.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const manifest = (await (await fetch('/ngsw.json')).json()) as {
              assetGroups: { name: string; urls: string[] }[];
            };
            const urls = manifest.assetGroups.find((g) => g.name === 'app')?.urls ?? [];
            const hits = await Promise.all(urls.map((u) => caches.match(u)));
            return urls.length > 0 && hits.every((h) => h !== undefined);
          }),
        { timeout: 30_000 },
      )
      .toBe(true);

    await context.setOffline(true);
    await page.reload();
    // The app shell came from the service worker (not a browser offline error page).
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const faces = await document.fonts.load("600 17px 'Bricolage Grotesque'");
          return faces.map((f) => f.status).join(',');
        }),
      )
      .toBe('loaded');
    await context.setOffline(false);
  });
});
