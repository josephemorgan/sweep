import { readFileSync, writeFileSync } from 'node:fs';
import { LANTERN_KEEP, expect, expectAccessible, test } from './support/fixtures';

test('updates the guide with a rename and keeps progress', async ({ page, runs }, testInfo) => {
  const runId = await runs.create(`Update ${testInfo.project.name}`);
  await runs.setTask(runId, 'village-chest', 'done');
  const source = readFileSync(LANTERN_KEEP, 'utf8');
  const renamed = source.replace(
    '  - id: village-chest\n',
    '  - id: mill-chest\n    renamed_from: village-chest\n',
  );
  expect(renamed).not.toBe(source);
  const file = testInfo.outputPath('lantern-keep-renamed.yaml');
  writeFileSync(file, renamed);

  await page.goto(`/runs/${runId}`);
  await page.getByRole('button', { name: 'Run menu' }).click();
  await page.getByRole('button', { name: /^Update guide/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Update guide' });
  await sheet.getByLabel(/New guide file/).setInputFiles(file);
  await expect(sheet).toContainText('Tasks: 0 added · 0 edited · 0 removed · 1 renamed');
  await expect(sheet).toContainText('Chest behind the mill → Chest behind the mill');
  await expect(sheet).toContainText('1 entry migrated through renames');
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Guide updated. Progress was kept.')).toBeVisible();

  const chest = page
    .getByRole('region', { name: 'Harrow Village' })
    .getByRole('checkbox', { name: 'Chest behind the mill' });
  await expect(chest).toBeChecked();
  await expect
    .poll(async () => {
      const res = await page.request.get(`/api/runs/${runId}`);
      const body = (await res.json()) as { progress: { tasks: Record<string, string> } };
      return body.progress.tasks;
    })
    .toEqual({ 'mill-chest': 'done' });
  await page.reload();
  await expect(chest).toBeChecked();

  // The same file again is identical: nothing to apply.
  await page.getByRole('button', { name: 'Run menu' }).click();
  await page.getByRole('button', { name: /^Update guide/ }).click();
  await sheet.getByLabel(/New guide file/).setInputFiles(file);
  await expect(sheet).toContainText('No changes');
  await expect(sheet.getByRole('button', { name: 'Apply' })).toHaveCount(0);
});
