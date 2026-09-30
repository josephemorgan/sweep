import { writeFileSync } from 'node:fs';
import {
  LANTERN_KEEP,
  expect,
  expectAccessible,
  expectNoHorizontalScroll,
  test,
} from './support/fixtures';

// The server checks one guide at a time per user, so this file's uploads must not overlap.
test.describe.configure({ mode: 'serial' });

test('uploads Lantern Keep, shows the report and creates a run', async ({
  page,
  runs,
}, testInfo) => {
  // A run to make the list non-empty (created through the API).
  await runs.create(`Seeded ${testInfo.project.name}`);
  await page.goto('/runs');
  await expect(page.getByRole('link', { name: /Seeded/ })).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole('link', { name: 'New run' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New run' })).toBeVisible();
  await page.getByLabel(/Guide file/).setInputFiles(LANTERN_KEEP);
  await expect(page.getByText('Lantern Keep · Completionist checklist')).toBeVisible();
  await expect(page.getByText('No errors.')).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  const name = page.getByLabel('Run name');
  await expect(name).toHaveValue('Completionist checklist');
  const runName = `Upload ${testInfo.project.name}`;
  await name.fill(runName);
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/runs') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create' }).click();
  expect((await created).status()).toBe(201);

  await page.goto('/runs');
  await expect(page.getByRole('link', { name: new RegExp(runName) })).toContainText(
    '0/7 sections cleared',
  );
});

test('blocks a guide with errors', async ({ page }, testInfo) => {
  const broken = testInfo.outputPath('broken.yaml');
  writeFileSync(broken, 'sweep: 1\ngame: Broken\n');
  await page.goto('/runs/new');
  await page.getByLabel(/Guide file/).setInputFiles(broken);
  await expect(page.getByRole('alert')).toContainText(
    'must be fixed before this guide can be used',
  );
  await expect(page.getByRole('button', { name: 'Create' })).toHaveCount(0);
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});
