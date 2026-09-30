import { expect, expectAccessible, test } from './support/fixtures';

test('clears with the impact dialog, then undoes', async ({ page, runs }, testInfo) => {
  const runId = await runs.create(`Clear ${testInfo.project.name}`);
  await page.goto(`/runs/${runId}`);
  const village = page.getByRole('region', { name: 'Harrow Village' });
  await village.getByRole('button', { name: 'Clear section' }).click();
  const dialog = page.getByRole('dialog', { name: 'Clear Harrow Village?' });
  await expect(dialog).toContainText('Clearing Harrow Village closes 2 open tasks.');
  await expect(dialog).toContainText('Pay the ferryman');
  await expect(dialog).toContainText("Find the elder's cat · 2nd chance at Epilogue");
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expectAccessible(page);

  // Undo must be clickable right after the modal closes (a modal dialog would make it inert).
  await dialog.getByRole('button', { name: 'Clear anyway' }).click();
  const marsh = page.getByRole('region', { name: 'Whisper Marsh' });
  await expect(marsh).toHaveAttribute('data-state', 'current');
  await expect(marsh).toBeInViewport();
  await expect(village).toHaveAttribute('data-state', 'cleared');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(village).toHaveAttribute('data-state', 'current');
  await expect(page.getByText(/unsaved/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Harrow Village' })).toHaveAttribute(
    'data-state',
    'current',
  );
});

test('cancelling the clear dialog changes nothing', async ({ page, runs }, testInfo) => {
  const runId = await runs.create(`Cancel ${testInfo.project.name}`);
  await page.goto(`/runs/${runId}`);
  const village = page.getByRole('region', { name: 'Harrow Village' });
  await village.getByRole('button', { name: 'Clear section' }).click();
  await page
    .getByRole('dialog', { name: 'Clear Harrow Village?' })
    .getByRole('button', { name: 'Cancel' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(village).toHaveAttribute('data-state', 'current');
});

test('pins a locked section after confirming, then unpins', async ({ page, runs }, testInfo) => {
  const runId = await runs.create(`Pin ${testInfo.project.name}`);
  await page.goto(`/runs/${runId}`);
  const marsh = page.getByRole('region', { name: 'Whisper Marsh' });
  await marsh.getByRole('button', { name: /Whisper Marsh/ }).click();
  await marsh.getByRole('button', { name: "I'm here" }).click();
  const pinDialog = page.getByRole('dialog', { name: 'Pin a locked section?' });
  await expectAccessible(page);
  await pinDialog.getByRole('button', { name: 'Pin anyway' }).click();
  await expect(marsh).toHaveAttribute('data-state', 'current');
  await expect(marsh.getByText('Pinned')).toBeVisible();
  await expect(marsh.getByText('Requires: Harrow Village')).toBeVisible();
  await marsh.getByRole('button', { name: 'Unpin' }).click();
  await expect(page.getByRole('region', { name: 'Harrow Village' })).toHaveAttribute(
    'data-state',
    'current',
  );
});
