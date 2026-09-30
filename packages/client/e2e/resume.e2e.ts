import { expect, test } from './support/fixtures';

test('launch reopens the last run at current, from cache, before the server answers', async ({
  page,
  runs,
}, testInfo) => {
  const runId = await runs.create(`Resume ${testInfo.project.name}`);
  await runs.clear(runId, ['village', 'marsh']);
  await page.goto(`/runs/${runId}`);
  await expect(page.getByRole('region', { name: 'Keep Gate' })).toHaveAttribute(
    'data-state',
    'current',
  );
  await page.goto('/runs');

  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/runs/${runId}`, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/runs/${runId}$`));
  const gate = page.getByRole('region', { name: 'Keep Gate' });
  await expect(gate).toHaveAttribute('data-state', 'current');
  await expect(gate).toBeInViewport();
  release();
  await page.unrouteAll({ behavior: 'wait' });

  // A reload on the deep link resumes too.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Keep Gate' })).toBeInViewport();
});
