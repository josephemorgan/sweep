import { expect, test } from '@playwright/test';

test('shell renders the app heading and format version', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Sweep' })).toBeVisible();
  await expect(page.getByText('Guide format v1')).toBeVisible();
});

test('page never scrolls horizontally (spec §5.9)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
