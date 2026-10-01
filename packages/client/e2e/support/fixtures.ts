import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { BASE_URL, storageStatePath, userEmail } from './e2e-env';
import { createUser, sessionIsValid, signInToFile } from './seed-user';

export const LANTERN_KEEP = path.join(__dirname, '../../../../guides/examples/lantern-keep.yaml');

export interface RunsHelper {
  /** Creates a run through the API (one upload) and returns its ID. */
  create(name: string, file?: string): Promise<string>;
  /** Clears leaves through the API, in order. */
  clear(runId: string, sectionIds: string[]): Promise<void>;
  setTask(runId: string, taskId: string, state: 'done' | 'dont-care' | null): Promise<void>;
}

export interface WorkerUser {
  email: string;
  storageState: string;
}

export const test = base.extend<{ runs: RunsHelper }, { workerUser: WorkerUser }>({
  // One seeded, signed-in user per (project, parallel slot). parallelIndex (not workerIndex) is
  // reused when a worker restarts after a failure. A restarted worker finds its storageState file,
  // checks the session with a GET and reuses it: 0 auth POSTs. Only a missing, expired or stale
  // file (e.g. from a previous server) costs create-user plus one sign-in POST.
  workerUser: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const email = userEmail(workerInfo.project.name, workerInfo.parallelIndex);
      const storageState = storageStatePath(workerInfo.project.name, workerInfo.parallelIndex);
      if (!(await sessionIsValid(email, storageState))) {
        createUser(email);
        await signInToFile(email, storageState);
      }
      await use({ email, storageState });
    },
    { scope: 'worker' },
  ],
  storageState: async ({ workerUser }, use) => {
    await use(workerUser.storageState);
  },
  runs: async ({ page }, use) => {
    const headers = { Origin: BASE_URL };
    await use({
      async create(name, file = LANTERN_KEEP) {
        const res = await page.request.post('/api/runs', {
          headers,
          multipart: {
            name,
            file: {
              name: path.basename(file),
              mimeType: 'application/yaml',
              buffer: readFileSync(file),
            },
          },
        });
        expect(res.status(), await res.text()).toBe(201);
        return ((await res.json()) as { runId: string }).runId;
      },
      async clear(runId, sectionIds) {
        for (const id of sectionIds) {
          const res = await page.request.put(`/api/runs/${runId}/sections/${id}`, {
            headers,
            data: { cleared: true },
          });
          expect(res.status(), await res.text()).toBe(204);
        }
      },
      async setTask(runId, taskId, state) {
        const res = await page.request.put(`/api/runs/${runId}/tasks/${taskId}`, {
          headers,
          data: { state },
        });
        expect(res.status(), await res.text()).toBe(204);
      },
    });
  },
});
export { expect };

/** axe with the WCAG 2.1 A/AA rule sets (packages/client/CLAUDE.md "Accessibility"). */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isHandheld(page: Page): boolean {
  // Mirrors HANDHELD_QUERY: landscape and at most 800px tall (640x400 Retroid, 1024x768).
  const { width, height } = page.viewportSize()!;
  return width > height && height <= 800;
}

function titled(title: string): RegExp {
  return new RegExp(`^${escapeRegExp(title)}(, current)?$`);
}

/** A leaf's row in the route list (phone: the card itself, expanded or not). Matches "X" and "X, current". */
export function routeRow(page: Page, title: string): Locator {
  return page
    .locator('section[id^="section-"]')
    .and(page.getByRole('region', { name: titled(title) }));
}

/** The leaf's task panel: the detail pane on handheld, the expanded card on phone. */
export function leafPanel(page: Page, title: string): Locator {
  if (!isHandheld(page)) return routeRow(page, title);
  return page
    .locator('section[id^="detail-section-"]')
    .and(page.getByRole('region', { name: titled(title) }));
}

/** Opens a leaf (expands its card on phone, selects it in the route pane on handheld) and returns its panel. */
export async function openLeaf(page: Page, title: string): Promise<Locator> {
  await routeRow(page, title)
    .getByRole('button', { name: new RegExp(escapeRegExp(title)) })
    .first()
    .click();
  return leafPanel(page, title);
}

/** A metric button, named "Here 3" in both bars. */
export function metric(bar: Locator, label: string, count: number): Locator {
  return bar.getByRole('button', { name: new RegExp(`^${label} ${count}$`) });
}

/** How far the route list has scrolled: the Route pane on handheld, `main` on phone (the page itself never scrolls). */
export function routeScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el =
      document.querySelector('aside[aria-label="Route"]') ?? document.querySelector('main');
    return el?.scrollTop ?? 0;
  });
}

/** Spec §5.9: never a horizontal page scroll. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
