import { writeFileSync } from 'node:fs';
import { longGuide } from './support/long-guide';
import type { Locator } from '@playwright/test';
import { expect, expectAccessible, expectNoHorizontalScroll, test } from './support/fixtures';

/** The category header row of an expanded card, e.g. `Story` ... `1 of 1`. */
function categoryHeader(card: Locator, name: string): Locator {
  return card.locator('[data-category-header]').filter({ hasText: name });
}

test("checks a task and uses don't care", async ({ page, runs }, testInfo) => {
  const runId = await runs.create(`Tasks ${testInfo.project.name}`);
  await page.goto(`/runs/${runId}`);
  const village = page.getByRole('region', { name: 'Harrow Village' });
  await expect(village.getByRole('button', { name: 'Clear section' })).toBeVisible();
  // §5.2 "On open": the current card is scrolled into view.
  await expect(village).toBeInViewport();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);

  await village.getByRole('checkbox', { name: 'Pay the ferryman' }).check();
  await expect(categoryHeader(village, 'Story').getByText('1 of 1')).toBeVisible();
  await village.getByRole('button', { name: 'More actions for Chest behind the mill' }).click();
  await page.getByRole('button', { name: "Don't care" }).click();
  await expect(village.getByText("Don't care", { exact: true })).toBeVisible();
  await expect(categoryHeader(village, 'Loot').getByText('0 of 0')).toBeVisible();
  await expect(page.getByText(/unsaved/)).toHaveCount(0);

  await page.reload();
  const reloaded = page.getByRole('region', { name: 'Harrow Village' });
  await expect(reloaded.getByRole('checkbox', { name: 'Pay the ferryman' })).toBeChecked();
  await expect(reloaded.getByText("Don't care", { exact: true })).toBeVisible();
});

test('makes an exclusive choice and switches it back', async ({ page, runs }, testInfo) => {
  const runId = await runs.create(`Exclusive ${testInfo.project.name}`);
  await runs.clear(runId, ['village', 'marsh', 'keep-gate']);
  await page.goto(`/runs/${runId}`);
  const west = page.getByRole('region', { name: 'West Tower' });
  await west.getByRole('button', { name: /West Tower/ }).click();
  await west.getByRole('checkbox', { name: 'Sunblade' }).check();
  await expect(west.getByRole('checkbox', { name: 'Moonshield' })).toBeDisabled();
  await expect(west.getByText('Not chosen')).toBeVisible();
  await expect(categoryHeader(west, 'Loot').getByText('1 of 1')).toBeVisible();
  // An expanded card with Markdown links and a not-chosen row, at both viewports.
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
  await west.getByRole('checkbox', { name: 'Sunblade' }).uncheck();
  await expect(west.getByRole('checkbox', { name: 'Moonshield' })).toBeEnabled();
  await expect(categoryHeader(west, 'Loot').getByText('0 of 2')).toBeVisible();
});

test('shows a long run name truncated in the top bar without horizontal scroll', async ({
  page,
  runs,
}, testInfo) => {
  // 100 characters is the server's limit.
  const name = `Long ${testInfo.project.name} ${'run name '.repeat(12)}`.slice(0, 100).trim();
  const runId = await runs.create(name);
  await page.goto(`/runs/${runId}`);
  const heading = page.getByRole('heading', { level: 1, name });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute('title', name);
  expect((await heading.boundingBox())!.width).toBeGreaterThan(80);
  expect(await heading.evaluate((h) => getComputedStyle(h).textOverflow)).toBe('ellipsis');
  if (testInfo.project.name === 'phone') {
    expect(await heading.evaluate((h) => h.scrollWidth > h.clientWidth)).toBe(true);
  }
  await expectNoHorizontalScroll(page);
});

const LINKED_GUIDE = `sweep: 1
game: Linked
title: Links
categories:
  loot:
    name: Loot
    about: Items.
sections:
  - id: hall
    title: Great Hall
    overview: A hall.
    walkthrough: |
      See [the wiki](https://example.com/hall) for a map.
tasks:
  - id: axe
    title: Axe
    category: loot
    exclusive: pick
    how: Details at [this page](https://example.com/axe).
    windows:
      - from: hall
  - id: bow
    title: Bow
    category: loot
    exclusive: pick
    how: Details at [this page](https://example.com/bow).
    windows:
      - from: hall
`;

test('an expanded card with Markdown links and a not-chosen row is accessible', async ({
  page,
  runs,
}, testInfo) => {
  const file = testInfo.outputPath('linked.yaml');
  writeFileSync(file, LINKED_GUIDE);
  const runId = await runs.create(`Links ${testInfo.project.name}`, file);
  await page.goto(`/runs/${runId}`);
  const hall = page.getByRole('region', { name: 'Great Hall' });
  await hall.getByRole('checkbox', { name: 'Axe' }).check();
  await hall.getByRole('button', { name: 'Bow', exact: true }).click();
  await hall.getByText('Walkthrough').click();
  await expect(hall.getByRole('link', { name: 'this page' })).toBeVisible();
  await expect(hall.getByRole('link', { name: 'the wiki' })).toBeVisible();
  await expect(hall.getByText('Not chosen')).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
});

test('opens on the current card below the fold, and a group walkthrough sheet is accessible', async ({
  page,
  runs,
}, testInfo) => {
  const file = testInfo.outputPath('long.yaml');
  writeFileSync(file, longGuide());
  const runId = await runs.create(`Long ${testInfo.project.name}`, file);
  await runs.clear(
    runId,
    Array.from({ length: 25 }, (_, i) => `leaf-${i + 1}`),
  );
  await page.goto(`/runs/${runId}`);
  const current = page.getByRole('region', { name: 'Room 26' });
  await expect(current.getByRole('button', { name: 'Clear section' })).toBeVisible();
  await expect(current).toBeInViewport();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Walkthrough for Chapter One' }).click();
  await expect(page.getByRole('dialog')).toContainText('Start at the first room');
  await expectAccessible(page);
});
