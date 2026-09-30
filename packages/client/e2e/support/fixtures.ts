import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';
import { BASE_URL, storageStatePath, userEmail } from './e2e-env';
import { createUser, signInToFile } from './seed-user';

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
  // reused when a worker restarts after a failure, so restarts cost no extra sign-ins.
  workerUser: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const email = userEmail(workerInfo.project.name, workerInfo.parallelIndex);
      const storageState = storageStatePath(workerInfo.project.name, workerInfo.parallelIndex);
      createUser(email);
      await signInToFile(email, storageState);
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

/** Spec §5.9: never a horizontal page scroll. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
