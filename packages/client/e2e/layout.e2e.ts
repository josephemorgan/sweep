import { writeFileSync } from 'node:fs';
import {
  expect,
  expectNoHorizontalScroll,
  leafPanel,
  openLeaf,
  routeRow,
  test,
} from './support/fixtures';
import { LONG_TITLE, longTitleGuide } from './support/long-title-guide';

test('layout follows spec §5.9 at this viewport', async ({ page, runs }, testInfo) => {
  const handheld = testInfo.project.name === 'handheld-4x3';
  const runId = await runs.create(`Layout ${testInfo.project.name}`);
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = seen;
    document.addEventListener('securitypolicyviolation', (e) =>
      seen.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });

  for (const url of ['/runs', '/runs/new', `/runs/${runId}`]) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
    // The runs and new-run pages keep a reading column; the run view uses the full width.
    if (!url.startsWith('/runs/') || url === '/runs/new') {
      expect((await page.locator('main').boundingBox())!.width).toBeLessThanOrEqual(720);
    }
  }

  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const viewport = page.viewportSize()!;
  const current = leafPanel(page, 'Harrow Village');
  await expect(current).toBeVisible();

  if (handheld) {
    const route = page.getByRole('complementary', { name: 'Route' });
    expect((await route.boundingBox())!.width).toBe(340);
    await expect(current.getByRole('button', { name: 'Clear section' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
  } else {
    const panel = (await current.boundingBox())!;
    expect(Math.abs(panel.x + panel.width - viewport.width)).toBeLessThanOrEqual(1);
  }

  // The run name keeps a sensible width next to the unsaved reservation and the menu button.
  const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  expect(h1.width).toBeGreaterThanOrEqual(120);

  const bar = page.getByRole('navigation', { name: 'Run metrics' });
  const barBox = (await bar.boundingBox())!;
  if (handheld) expect(barBox.height).toBeLessThanOrEqual(56);
  else expect(barBox.height).toBe(64);

  await bar.getByRole('button', { name: /^Now/ }).click();
  const sheet = (await page.getByRole('dialog', { name: 'Now', exact: true }).boundingBox())!;
  if (handheld) {
    expect(Math.round(sheet.x + sheet.width)).toBe(viewport.width);
    expect(sheet.width).toBeLessThanOrEqual(480);
    expect(Math.round(sheet.height)).toBe(viewport.height);
  } else {
    expect(Math.round(sheet.y + sheet.height)).toBe(viewport.height);
    expect(Math.round(sheet.width)).toBe(clientWidth);
  }
  await page.keyboard.press('Escape');

  const small = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        'header a, header button, main button, nav button, main label:has(input[type=checkbox])',
      ),
    ]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.width < 44 || r.height < 44);
      })
      .map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName),
  );
  expect(small).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
});

test('a 70-character leaf title truncates on one line in the route pane', async ({
  page,
  runs,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'handheld-4x3', 'the route pane is handheld-only');
  expect(LONG_TITLE).toHaveLength(70);
  const file = testInfo.outputPath('long-title.yaml');
  writeFileSync(file, longTitleGuide());
  const runId = await runs.create(`Title ${testInfo.project.name}`, file);
  await page.goto(`/runs/${runId}`);
  const row = routeRow(page, LONG_TITLE);
  await expect(row).toBeVisible();
  const title = row.locator('span.truncate').first();
  expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await title.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap');
  const short = (await routeRow(page, 'Start').boundingBox())!;
  const long = (await row.boundingBox())!;
  expect(Math.abs(long.height - short.height)).toBeLessThanOrEqual(1);
  expect((await page.getByRole('complementary', { name: 'Route' }).boundingBox())!.width).toBe(340);
  await expectNoHorizontalScroll(page);
});

test('a not-chosen row reads as disabled and the top bar stays reachable', async ({
  page,
  runs,
}, testInfo) => {
  const runId = await runs.create(`Disabled ${testInfo.project.name}`);
  await runs.clear(runId, ['village', 'marsh', 'keep-gate']);
  await page.goto(`/runs/${runId}`);
  const west = await openLeaf(page, 'West Tower');
  await west.getByRole('checkbox', { name: 'Sunblade' }).check();
  const moonshield = west.getByRole('checkbox', { name: 'Moonshield' });
  await expect(moonshield).toBeDisabled();
  await moonshield.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('not-chosen.png') });
  await expectNoHorizontalScroll(page);
  // Nothing fixed at the top may cover the sticky top bar's controls.
  const covered = await page.evaluate(() => {
    const header = document.querySelector('header:has(h1)')!;
    return [...header.querySelectorAll('a, button')].filter((el) => {
      if (!el.checkVisibility()) return false;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !el.contains(hit);
    }).length;
  });
  expect(covered).toBe(0);
});
