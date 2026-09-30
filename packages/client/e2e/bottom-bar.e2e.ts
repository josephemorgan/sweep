import { expect, expectAccessible, expectNoHorizontalScroll, test } from './support/fixtures';

test('metrics, the NOW sheet and the category filter', async ({ page, runs }, testInfo) => {
  const runId = await runs.create(`Metrics ${testInfo.project.name}`);
  await page.goto(`/runs/${runId}`);
  const bar = page.getByRole('navigation', { name: 'Run metrics' });
  await expect(bar.getByRole('button', { name: 'HERE 3' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'CLOSING 2' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'LAST CHANCE 1' })).toBeVisible();

  // The fixed bar never covers the last card.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const barBox = (await bar.boundingBox())!;
  const cards = page.getByRole('region');
  const lastBox = (await cards.last().boundingBox())!;
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(barBox.y + 1);
  await expectNoHorizontalScroll(page);

  await bar.getByRole('button', { name: 'NOW 3' }).click();
  const sheet = page.getByRole('dialog', { name: 'NOW' });
  await expect(sheet.getByRole('heading', { name: 'Harrow Village' })).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  // Escape closes the row menu first, then the sheet.
  await sheet.getByRole('button', { name: 'More actions for Pay the ferryman' }).click();
  await expect(sheet.getByRole('button', { name: "Don't care" })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet.getByRole('button', { name: "Don't care" })).toBeHidden();
  await expect(sheet).toBeVisible();

  await sheet.getByRole('checkbox', { name: 'Pay the ferryman' }).check();
  await expect(sheet.getByRole('checkbox', { name: 'Pay the ferryman' })).toBeChecked();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(bar.getByRole('button', { name: 'NOW 2' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'LAST CHANCE 0' })).toBeVisible();

  await bar.getByLabel('Category filter').selectOption({ label: 'Loot' });
  await expect(bar.getByRole('button', { name: 'HERE 1' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'CLOSING 0' })).toBeVisible();
});
