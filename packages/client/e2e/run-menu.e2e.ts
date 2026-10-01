import { expect, expectAccessible, leafPanel, metric, routeRow, test } from './support/fixtures';

test('renames, toggles a category and jumps to a section', async ({ page, runs }, testInfo) => {
  const runId = await runs.create(`Menu ${testInfo.project.name}`);
  await page.goto(`/runs/${runId}`);
  const menu = page.getByRole('button', { name: 'Run menu' });

  await menu.click();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Rename run' }).click();
  await expectAccessible(page);
  await page.getByLabel('Run name').fill(`Renamed ${testInfo.project.name}`);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `Renamed ${testInfo.project.name}`,
  );

  await menu.click();
  await page.getByRole('button', { name: 'Categories', exact: true }).click();
  await expectAccessible(page);
  await page.getByRole('switch', { name: /Side quests/ }).uncheck();
  await page
    .getByRole('dialog', { name: 'Categories' })
    .getByRole('button', { name: 'Close' })
    .click();
  await expect(leafPanel(page, 'Harrow Village').getByText('Side quests')).toHaveCount(0);
  await expect(
    metric(page.getByRole('navigation', { name: 'Run metrics' }), 'Here', 2),
  ).toBeVisible();

  await menu.click();
  await page.getByRole('button', { name: 'Jump to section' }).click();
  const jump = page.getByRole('dialog', { name: 'Jump to section' });
  await expectAccessible(page);
  // §5.6: the locked spoiler section's title is not exposed.
  await expect(jump.getByRole('button', { name: 'Throne Room' })).toHaveCount(0);
  await expect(jump.getByRole('button', { name: 'Hidden section' })).toHaveCount(1);
  await jump.getByRole('button', { name: 'Epilogue' }).click();
  await expect(routeRow(page, 'Epilogue')).toBeInViewport();
  await expect(routeRow(page, 'Epilogue').getByRole('button').first()).toBeFocused();

  await page.goto('/runs');
  await expect(
    page.getByRole('link', { name: new RegExp(`Renamed ${testInfo.project.name}`) }),
  ).toBeVisible();
});

test('the Update guide entry is offered in the menu', async ({ page, runs }, testInfo) => {
  const runId = await runs.create(`Update entry ${testInfo.project.name}`);
  await page.goto(`/runs/${runId}`);
  await page.getByRole('button', { name: 'Run menu' }).click();
  await expect(page.getByRole('button', { name: /^Update guide/ })).toBeEnabled();
});

test('deletes a run after confirming its name', async ({ page, runs }, testInfo) => {
  const name = `Doomed ${testInfo.project.name}`;
  const runId = await runs.create(name);
  await page.goto(`/runs/${runId}`);
  await page.getByRole('button', { name: 'Run menu' }).click();
  await page.getByRole('button', { name: 'Delete run' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete run?' });
  await expect(confirm).toContainText(`Delete “${name}”?`);
  await expectAccessible(page);
  await confirm.getByRole('button', { name: 'Delete run' }).click();
  await expect(page).toHaveURL(/\/runs$/);
  await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
});
