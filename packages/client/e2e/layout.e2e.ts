import { expect, expectNoHorizontalScroll, test } from './support/fixtures';

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
  }

  // The last page is the run: geometry is measured against the scrollbar-safe client width.
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const viewport = page.viewportSize()!;
  const main = (await page.locator('main').boundingBox())!;
  expect(main.width).toBeLessThanOrEqual(720);
  if (handheld) expect(Math.abs(main.x + main.width / 2 - clientWidth / 2)).toBeLessThan(2);

  // The run name keeps a sensible width next to the unsaved reservation and the menu button.
  const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  expect(h1.width).toBeGreaterThanOrEqual(120);

  const bar = page.getByRole('navigation', { name: 'Run metrics' });
  const barBox = (await bar.boundingBox())!;
  expect(barBox.height).toBeLessThanOrEqual(handheld ? 56 : 120);

  await bar.getByRole('button', { name: /^NOW/ }).click();
  const sheet = (await page.getByRole('dialog', { name: 'NOW' }).boundingBox())!;
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

test('a not-chosen row reads as disabled and the top bar stays reachable', async ({
  page,
  runs,
}, testInfo) => {
  const runId = await runs.create(`Disabled ${testInfo.project.name}`);
  await runs.clear(runId, ['village', 'marsh', 'keep-gate']);
  await page.goto(`/runs/${runId}`);
  const west = page.getByRole('region', { name: 'West Tower' });
  await west.getByRole('button', { name: /West Tower/ }).click();
  await west.getByRole('checkbox', { name: 'Sunblade' }).check();
  const moonshield = west.getByRole('checkbox', { name: 'Moonshield' });
  await expect(moonshield).toBeDisabled();
  await moonshield.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('not-chosen.png') });
  await expectNoHorizontalScroll(page);
  // Nothing fixed at the top may cover the sticky top bar's controls.
  const covered = await page.evaluate(() => {
    const header = document.querySelector('header:has(> h1)')!;
    return [...header.querySelectorAll('a, button')].filter((el) => {
      if (!el.checkVisibility()) return false;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !el.contains(hit);
    }).length;
  });
  expect(covered).toBe(0);
});
