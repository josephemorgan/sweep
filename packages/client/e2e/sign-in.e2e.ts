import { E2E_PASSWORD } from './support/e2e-env';
import { expect, expectAccessible, expectNoHorizontalScroll, test } from './support/fixtures';

test.describe('sign in', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('rejects a wrong password, then signs in and lands on the runs list', async ({
    page,
    workerUser,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in to Sweep' })).toBeVisible();
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);

    await page.getByLabel('Email').fill(workerUser.email);
    await page.getByLabel('Password').fill('wrong-password-000');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong email or password.');

    await page.getByLabel('Password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Runs' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
