import {
  diffGuides,
  migrateProgress,
  type ApplyGuideResponseDto,
  type DryRunUpdateResponseDto,
  type Guide,
} from '@sweep/core';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { runs, type RunRow } from '../db/schema.js';
import { validGuide, type ParsedUpload } from '../guides/core-adapter.js';
import { insertGuideVersion, loadCurrentGuide } from '../guides/store.js';
import { ApiErrorCode, HttpError } from '../http/errors.js';
import type { Quotas } from '../limits.js';
import { buildPayload } from './dto.js';
import { lockRun, readProgress, writeProgressChanges } from './progress-store.js';
import { assertStorageQuota, assertVersionQuota, lockUserQuota } from './quotas.js';

/** One consistent snapshot for the preview's reads (guide version and progress). */
const SNAPSHOT = { isolationLevel: 'repeatable read', accessMode: 'read only' } as const;

export function staleVersion(): HttpError {
  return new HttpError(
    409,
    ApiErrorCode.StaleVersion,
    'A newer guide version exists. Review the update again.',
  );
}

/**
 * Dry run: issues plus diffGuides(current, next, progress). Writes nothing. `run` is the row the
 * caller checked baseVersion against; if an apply has committed since, this is 409 too.
 */
export async function previewGuideUpdate(
  db: Database,
  run: RunRow,
  upload: ParsedUpload,
): Promise<DryRunUpdateResponseDto> {
  const next = validGuide(upload.result);
  if (!next) return { issues: upload.result.issues, diff: null };
  return db.transaction(async (tx) => {
    const [fresh] = await tx.select().from(runs).where(eq(runs.id, run.id));
    if (!fresh) throw new HttpError(404, ApiErrorCode.NotFound, 'No such run.');
    if (fresh.currentVersion !== run.currentVersion) throw staleVersion();
    const { guide: current } = await loadCurrentGuide(tx, fresh);
    const progress = await readProgress(tx, fresh.id);
    return { issues: upload.result.issues, diff: diffGuides(current, next, progress) };
  }, SNAPSHOT);
}

export interface ApplyGuideInput {
  userId: string;
  upload: ParsedUpload;
  guide: Guide;
  baseVersion: number;
  quotas: Quotas;
}

/**
 * Apply, in ONE transaction (spec §6.3): take the user's quota lock (first, as createRun does),
 * lock the run, check baseVersion and quotas, insert version n+1, migrate the progress re-read
 * under the lock through the renames, set current_version, and return the payload. Only the
 * moves in `diff.progress.migrated` are applied; a move whose target already has progress is
 * skipped and the old row stays as orphaned progress (spec §4.11). Any failure rolls it all back.
 */
export async function applyGuideUpdate(
  db: Database,
  runId: string,
  input: ApplyGuideInput,
): Promise<ApplyGuideResponseDto> {
  return db.transaction(async (tx) => {
    await lockUserQuota(tx, input.userId);
    const run = await lockRun(tx, runId);
    if (run.currentVersion !== input.baseVersion) throw staleVersion();
    await assertVersionQuota(tx, run.id, input.quotas);
    await assertStorageQuota(tx, input.userId, input.upload.bytes, input.quotas);

    const { guide: current } = await loadCurrentGuide(tx, run);
    const before = await readProgress(tx, run.id);
    const diff = diffGuides(current, input.guide, before);
    const after = migrateProgress(before, diff);
    const nextVersion = run.currentVersion + 1;

    await insertGuideVersion(tx, {
      runId: run.id,
      version: nextVersion,
      upload: input.upload,
      guide: input.guide,
    });
    // Also sets the pin and bumps updated_at.
    await writeProgressChanges(tx, run.id, before, after, diff.progress?.migrated ?? []);
    const [updated] = await tx
      .update(runs)
      .set({ currentVersion: nextVersion })
      .where(eq(runs.id, run.id))
      .returning();
    if (!updated) throw new Error('applyGuideUpdate: run vanished inside its own lock');
    return buildPayload(tx, updated);
  });
}
