import { writeFileSync } from 'node:fs';
import { expect, routeRow, routeScrollTop, test } from './support/fixtures';
import { longGuide } from './support/long-guide';

test('launch reopens the last run scrolled to current, from cache, before the server answers', async ({
  page,
  runs,
}, testInfo) => {
  // Room 26 is current and below the fold at both viewports.
  const file = testInfo.outputPath('long.yaml');
  writeFileSync(file, longGuide());
  const runId = await runs.create(`Resume ${testInfo.project.name}`, file);
  await runs.clear(
    runId,
    Array.from({ length: 25 }, (_, i) => `leaf-${i + 1}`),
  );
  const current = routeRow(page, 'Room 26');
  const scrolledToCurrent = async (): Promise<void> => {
    await expect(current).toHaveAttribute('data-state', 'current');
    await expect(current).toBeInViewport();
    await expect.poll(() => routeScrollTop(page)).toBeGreaterThan(0);
  };

  await page.goto(`/runs/${runId}`);
  await scrolledToCurrent();
  await page.goto('/runs');

  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/runs/${runId}`, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/runs/${runId}$`));
  await scrolledToCurrent();
  release();
  await page.unrouteAll({ behavior: 'wait' });

  // A reload on the deep link resumes too.
  await page.reload();
  await scrolledToCurrent();
});
