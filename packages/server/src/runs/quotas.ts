import { count, eq, sql, sum } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { guideVersions, runs } from '../db/schema.js';
import { ApiErrorCode, HttpError } from '../http/errors.js';
import type { Quotas } from '../limits.js';

/**
 * Serializes quota-checked writes per user until the transaction ends, so two concurrent
 * uploads can't both pass a check and overshoot (spec §6.5).
 */
export async function lockUserQuota(ex: Executor, userId: string): Promise<void> {
  await ex.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
}

export async function assertRunQuota(ex: Executor, userId: string, quotas: Quotas): Promise<void> {
  const [row] = await ex.select({ n: count() }).from(runs).where(eq(runs.userId, userId));
  if ((row?.n ?? 0) >= quotas.runsPerUser) {
    throw new HttpError(
      409,
      ApiErrorCode.QuotaRuns,
      `You can have at most ${quotas.runsPerUser} runs. Delete one to start another.`,
    );
  }
}

export async function assertVersionQuota(
  ex: Executor,
  runId: string,
  quotas: Quotas,
): Promise<void> {
  const [row] = await ex
    .select({ n: count() })
    .from(guideVersions)
    .where(eq(guideVersions.runId, runId));
  if ((row?.n ?? 0) >= quotas.versionsPerRun) {
    throw new HttpError(
      409,
      ApiErrorCode.QuotaVersions,
      `A run keeps at most ${quotas.versionsPerRun} guide versions. Start a new run to keep updating.`,
    );
  }
}

export async function assertStorageQuota(
  ex: Executor,
  userId: string,
  addBytes: number,
  quotas: Quotas,
): Promise<void> {
  const [row] = await ex
    .select({ total: sum(guideVersions.sourceBytes) })
    .from(guideVersions)
    .innerJoin(runs, eq(runs.id, guideVersions.runId))
    .where(eq(runs.userId, userId));
  const used = Number(row?.total ?? 0);
  if (used + addBytes > quotas.sourceBytesPerUser) {
    throw new HttpError(
      409,
      ApiErrorCode.QuotaStorage,
      'Your stored guides are at the storage limit. Delete a run to free space.',
    );
  }
}
