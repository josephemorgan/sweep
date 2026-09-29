import { ProgressKind, type ProgressMigration, type RunProgress } from '@sweep/core';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database, Executor } from '../db/client.js';
import { categoryPrefs, runs, sectionProgress, taskProgress, type RunRow } from '../db/schema.js';
import { ApiErrorCode, HttpError } from '../http/errors.js';

/** Rows per statement: keeps every statement far below Postgres's 65,535-parameter limit. */
const BATCH = 1_000;

function batches<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH) out.push(items.slice(i, i + BATCH));
  return out;
}

/**
 * Row-locks the run for the rest of the transaction. Every progress write takes this lock,
 * so concurrent writes to one run serialize and never clobber the pin (Review Focus 2).
 */
export async function lockRun(ex: Executor, runId: string): Promise<RunRow> {
  const [row] = await ex.select().from(runs).where(eq(runs.id, runId)).for('update');
  if (!row) throw new HttpError(404, ApiErrorCode.NotFound, 'No such run.');
  return row;
}

export async function readProgress(ex: Executor, runId: string): Promise<RunProgress> {
  const [run] = await ex.select({ pin: runs.pinnedSectionId }).from(runs).where(eq(runs.id, runId));
  const cleared = await ex
    .select({ id: sectionProgress.sectionId })
    .from(sectionProgress)
    .where(eq(sectionProgress.runId, runId));
  const tasks = await ex
    .select({ id: taskProgress.taskId, state: taskProgress.state })
    .from(taskProgress)
    .where(eq(taskProgress.runId, runId));
  const prefs = await ex
    .select({ id: categoryPrefs.categoryId, tracked: categoryPrefs.tracked })
    .from(categoryPrefs)
    .where(eq(categoryPrefs.runId, runId));
  return {
    cleared: new Set(cleared.map((r) => r.id)),
    pin: run?.pin ?? null,
    tasks: new Map(tasks.map((r) => [r.id, r.state])),
    tracked: new Map(prefs.map((r) => [r.id, r.tracked])),
  };
}

/**
 * Makes the stored progress equal `after`, given that it currently equals `before`.
 * Renames (from diffGuides' `progress.migrated`) move rows in place first so `cleared_at` and
 * `updated_at` survive; a rename whose target already has progress is skipped (the target wins,
 * the old row stays orphaned, as migrateProgress does). Always sets the pin and bumps updated_at.
 */
export async function writeProgressChanges(
  ex: Executor,
  runId: string,
  before: RunProgress,
  after: RunProgress,
  renames: readonly ProgressMigration[] = [],
): Promise<void> {
  const stored: RunProgress = {
    cleared: new Set(before.cleared),
    pin: before.pin,
    tasks: new Map(before.tasks),
    tracked: new Map(before.tracked),
  };

  for (const { kind, from, to } of renames) {
    switch (kind) {
      case ProgressKind.Cleared:
        if (stored.cleared.has(from) && !stored.cleared.has(to)) {
          await ex
            .update(sectionProgress)
            .set({ sectionId: to })
            .where(and(eq(sectionProgress.runId, runId), eq(sectionProgress.sectionId, from)));
          stored.cleared.delete(from);
          stored.cleared.add(to);
        }
        break;
      case ProgressKind.Task: {
        const state = stored.tasks.get(from);
        if (state !== undefined && !stored.tasks.has(to)) {
          await ex
            .update(taskProgress)
            .set({ taskId: to })
            .where(and(eq(taskProgress.runId, runId), eq(taskProgress.taskId, from)));
          stored.tasks.delete(from);
          stored.tasks.set(to, state);
        }
        break;
      }
      case ProgressKind.Tracked: {
        const tracked = stored.tracked.get(from);
        if (tracked !== undefined && !stored.tracked.has(to)) {
          await ex
            .update(categoryPrefs)
            .set({ categoryId: to })
            .where(and(eq(categoryPrefs.runId, runId), eq(categoryPrefs.categoryId, from)));
          stored.tracked.delete(from);
          stored.tracked.set(to, tracked);
        }
        break;
      }
      case ProgressKind.Pin:
        // The pin is a column on runs, written below from `after.pin`.
        break;
    }
  }

  const unclear = [...stored.cleared].filter((id) => !after.cleared.has(id));
  for (const ids of batches(unclear)) {
    await ex
      .delete(sectionProgress)
      .where(and(eq(sectionProgress.runId, runId), inArray(sectionProgress.sectionId, ids)));
  }
  const clear = [...after.cleared].filter((id) => !stored.cleared.has(id));
  for (const ids of batches(clear)) {
    await ex
      .insert(sectionProgress)
      .values(ids.map((sectionId) => ({ runId, sectionId })))
      .onConflictDoNothing();
  }

  const taskDeletes = [...stored.tasks.keys()].filter((id) => !after.tasks.has(id));
  for (const ids of batches(taskDeletes)) {
    await ex
      .delete(taskProgress)
      .where(and(eq(taskProgress.runId, runId), inArray(taskProgress.taskId, ids)));
  }
  const taskUpserts = [...after.tasks].filter(([id, state]) => stored.tasks.get(id) !== state);
  for (const rows of batches(taskUpserts)) {
    await ex
      .insert(taskProgress)
      .values(rows.map(([taskId, state]) => ({ runId, taskId, state })))
      .onConflictDoUpdate({
        target: [taskProgress.runId, taskProgress.taskId],
        set: { state: sql`excluded.state`, updatedAt: sql`now()` },
      });
  }

  const prefDeletes = [...stored.tracked.keys()].filter((id) => !after.tracked.has(id));
  for (const ids of batches(prefDeletes)) {
    await ex
      .delete(categoryPrefs)
      .where(and(eq(categoryPrefs.runId, runId), inArray(categoryPrefs.categoryId, ids)));
  }
  const prefUpserts = [...after.tracked].filter(([id, value]) => stored.tracked.get(id) !== value);
  for (const rows of batches(prefUpserts)) {
    await ex
      .insert(categoryPrefs)
      .values(rows.map(([categoryId, tracked]) => ({ runId, categoryId, tracked })))
      .onConflictDoUpdate({
        target: [categoryPrefs.runId, categoryPrefs.categoryId],
        set: { tracked: sql`excluded.tracked` },
      });
  }

  await ex
    .update(runs)
    .set({ pinnedSectionId: after.pin, updatedAt: sql`now()` })
    .where(eq(runs.id, runId));
}

/** Runs under the run lock, before the read: validates the write against the locked run. */
export type ProgressCheck = (ex: Executor, run: RunRow) => Promise<void>;

/**
 * One progress write: lock the run, run `check`, read, apply a core setter, write the difference.
 * `check` sees the run as locked, so the guide version it checks against is still current at
 * commit: a guide update can't commit in between (it takes the same lock).
 */
export async function mutateProgress(
  db: Database,
  runId: string,
  change: (progress: RunProgress) => RunProgress,
  check?: ProgressCheck,
): Promise<void> {
  await db.transaction(async (tx) => {
    const run = await lockRun(tx, runId);
    await check?.(tx, run);
    const before = await readProgress(tx, runId);
    await writeProgressChanges(tx, runId, before, change(before));
  });
}
