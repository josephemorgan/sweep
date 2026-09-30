import { expect, test } from './support/fixtures';

test('checks a task offline and syncs on reconnect', async ({ page, context, runs }, testInfo) => {
  const runId = await runs.create(`Offline ${testInfo.project.name}`);
  await page.goto(`/runs/${runId}`);
  const village = page.getByRole('region', { name: 'Harrow Village' });
  await expect(village).toHaveAttribute('data-state', 'current');

  await context.setOffline(true);
  await village.getByRole('checkbox', { name: 'Pay the ferryman' }).check();
  await expect(village.getByText('Story 1/1')).toBeVisible();
  await expect(page.getByText('1 unsaved', { exact: true })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('1 unsaved', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(
    page
      .getByRole('region', { name: 'Harrow Village' })
      .getByRole('checkbox', { name: 'Pay the ferryman' }),
  ).toBeChecked();
});
