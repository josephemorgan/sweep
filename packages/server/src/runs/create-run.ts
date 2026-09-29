import type { Guide } from '@sweep/core';
import type { Database } from '../db/client.js';
import { runs } from '../db/schema.js';
import type { ParsedUpload } from '../guides/core-adapter.js';
import { insertGuideVersion } from '../guides/store.js';
import { RUN_NAME_MAX_LENGTH } from '../http/validate.js';
import type { Quotas } from '../limits.js';
import { assertRunQuota, assertStorageQuota, lockUserQuota } from './quotas.js';

/**
 * The guide's title, else its game, fitted to the run name rule (spec §6.2: trimmed,
 * 1–100 code points, no control characters).
 */
export function defaultRunName(guide: Guide): string {
  const fit = (text: string): string => {
    const clean = text.replace(/\p{Cc}+/gu, ' ').trim();
    return [...clean].slice(0, RUN_NAME_MAX_LENGTH).join('').trim();
  };
  return fit(guide.title) || fit(guide.game) || 'Untitled run';
}

export interface CreateRunInput {
  userId: string;
  upload: ParsedUpload;
  guide: Guide;
  name: string | undefined;
  quotas: Quotas;
}

/**
 * Inserts the run and guide version 1 in one transaction. The per-user quota lock is taken
 * first, in the same transaction as the checks and inserts, so concurrent creates can't
 * overshoot (spec §6.5). A new run has no versions yet, so only the run and storage quotas apply.
 */
export async function createRun(db: Database, input: CreateRunInput): Promise<string> {
  return db.transaction(async (tx) => {
    await lockUserQuota(tx, input.userId);
    await assertRunQuota(tx, input.userId, input.quotas);
    await assertStorageQuota(tx, input.userId, input.upload.bytes, input.quotas);
    const [run] = await tx
      .insert(runs)
      .values({
        userId: input.userId,
        name: input.name ?? defaultRunName(input.guide),
        currentVersion: 1,
      })
      .returning({ id: runs.id });
    if (!run) throw new Error('createRun: insert returned no row');
    await insertGuideVersion(tx, {
      runId: run.id,
      version: 1,
      upload: input.upload,
      guide: input.guide,
    });
    return run.id;
  });
}
