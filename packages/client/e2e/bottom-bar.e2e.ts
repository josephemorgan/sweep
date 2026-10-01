import {
  expect,
  expectAccessible,
  expectNoHorizontalScroll,
  metric,
  test,
} from './support/fixtures';

test('metrics, the Now sheet and the category filter', async ({ page, runs }, testInfo) => {
  const runId = await runs.create(`Metrics ${testInfo.project.name}`);
  await page.goto(`/runs/${runId}`);
  const bar = page.getByRole('navigation', { name: 'Run metrics' });
  await expect(metric(bar, 'Here', 3)).toBeVisible();
  await expect(metric(bar, 'Closing', 2)).toBeVisible();
  await expect(metric(bar, 'Last chance', 1)).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Filter categories: all tracked' })).toBeVisible();

  if (testInfo.project.name === 'phone') {
    // The bar sits after the scrolling main, so it never covers the last card.
    await page.locator('main').evaluate((m) => m.scrollTo(0, m.scrollHeight));
    const barBox = (await bar.boundingBox())!;
    const lastBox = (await page.locator('main section[id^="section-"]').last().boundingBox())!;
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(barBox.y + 1);
  }
  await expectNoHorizontalScroll(page);

  await metric(bar, 'Now', 3).click();
  const sheet = page.getByRole('dialog', { name: 'Now', exact: true });
  await expect(sheet.getByRole('heading', { name: 'Harrow Village' })).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  // Escape closes the row menu first, then the sheet.
  await sheet.getByRole('button', { name: 'More actions for Pay the ferryman' }).click();
  await expect(sheet.getByRole('button', { name: "Don't care" })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet.getByRole('button', { name: "Don't care" })).toBeHidden();
  await expect(sheet).toBeVisible();
  // A second Escape closes the sheet (the native dialog cancel).
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await metric(bar, 'Now', 3).click();
  await sheet.getByRole('checkbox', { name: 'Pay the ferryman' }).check();
  await expect(sheet.getByRole('checkbox', { name: 'Pay the ferryman' })).toBeChecked();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(metric(bar, 'Now', 2)).toBeVisible();
  await expect(metric(bar, 'Last chance', 0)).toBeVisible();

  await bar.getByRole('button', { name: 'Filter categories: all tracked' }).click();
  const filter = page.getByRole('dialog', { name: 'Filter categories' });
  await expect(filter.getByRole('button', { name: 'All tracked' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await filter.getByRole('button', { name: 'Loot' }).click();
  await expect(bar.getByRole('button', { name: 'Filter categories: Loot' })).toBeVisible();
  await expect(metric(bar, 'Here', 1)).toBeVisible();
  await expect(metric(bar, 'Closing', 0)).toBeVisible();
});
