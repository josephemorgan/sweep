import { MODEL_VERSION } from '@sweep/core';
import { and, eq, ne } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { guideVersions, runs } from '../db/schema.js';
import { describeError } from '../http/error-handler.js';
import { RENORMALIZE_RETRY_MS } from '../limits.js';
import { containerFileName, reparse, validGuide, type ParseOutcome } from './core-adapter.js';
import { currentVersionOf, type RunRef } from './store.js';

export type Reparse = typeof reparse;

/** Test hooks (createApp's `renormalize` option). */
export interface RenormalizerHooks {
  /** The adapter's reparse, wrapped (tests count, fail or hold parses with it). */
  reparse?: Reparse | undefined;
  /** The clock for the retry backoff. Default Date.now. */
  now?: (() => number) | undefined;
  /** Called when a caller joins a re-normalization already in flight. */
  onJoin?: ((versionId: string) => void) | undefined;
}

export interface RenormalizerOptions extends RenormalizerHooks {
  /** Time budget per re-parse (PARSE_TIMEOUT_MS). */
  timeoutMs: number;
  /** Test hook: the parse worker entry to run instead of parse-worker. */
  workerUrl?: URL | undefined;
}

/**
 * Re-normalizes stored guide models when core's MODEL_VERSION has moved on (spec §6.1). Routes
 * call it BEFORE opening the transaction that loads the current guide: the re-parse runs in a
 * worker for up to its time budget, which must never happen inside a transaction, and
 * loadCurrentGuide stays a pure read.
 */
export interface Renormalizer {
  /** Re-normalizes the run's current guide version if its model is stale. */
  ensureCurrentModel(db: Database, run: RunRef): Promise<void>;
  /** The same for the current version of each of the user's runs, one at a time. */
  ensureUserModels(db: Database, userId: string): Promise<void>;
}

export function renormalizer(options: RenormalizerOptions): Renormalizer {
  const parse = options.reparse ?? reparse;
  const now = options.now ?? Date.now;
  const parseOptions = { timeoutMs: options.timeoutMs, workerUrl: options.workerUrl };
  /** version id → the re-normalization in progress. Concurrent callers share one parse. */
  const inFlight = new Map<string, Promise<void>>();
  /** The parse finished with errors: deterministic, so never re-parsed in this process. */
  const failed = new Set<string>();
  /** version id → when to try again, after a timeout or a worker failure (transient). */
  const retryAt = new Map<string, number>();

  // Codes or a content-free error only: never guide content. Either way the stored model is served.
  const log = (versionId: string, why: string, next: string): void => {
    console.error(
      `guide store: re-normalizing guide version ${versionId} failed (${why}); serving the stored model, ${next}.`,
    );
  };
  const giveUp = (versionId: string, codes: string): void => {
    failed.add(versionId);
    log(versionId, codes, 'not retrying');
  };
  const backOff = (versionId: string, why: string): void => {
    retryAt.set(versionId, now() + RENORMALIZE_RETRY_MS);
    log(versionId, why, `retrying in ${RENORMALIZE_RETRY_MS / 1000} s`);
  };

  async function refresh(db: Database, versionId: string): Promise<void> {
    // Re-read: another request may have re-normalized it since the caller looked.
    const [row] = await db
      .select({
        source: guideVersions.source,
        container: guideVersions.container,
        modelVersion: guideVersions.modelVersion,
      })
      .from(guideVersions)
      .where(eq(guideVersions.id, versionId));
    if (!row || row.modelVersion === MODEL_VERSION) return;
    let outcome: ParseOutcome;
    try {
      outcome = await parse(row.source, containerFileName(row.container), parseOptions);
    } catch (err) {
      // reparse's rejections carry no guide content (core-adapter workerFailed).
      backOff(versionId, describeError(err));
      return;
    }
    if (outcome.timedOut) {
      backOff(versionId, 'the parse ran over its time budget');
      return;
    }
    const fresh = validGuide(outcome.result);
    if (!fresh) {
      giveUp(versionId, [...new Set(outcome.result.issues.map((i) => i.code))].join(', '));
      return;
    }
    // One statement, so its own short transaction. Conditional on the old model_version, so a
    // concurrent writer (another process) makes this a no-op rather than a lost update.
    await db
      .update(guideVersions)
      .set({ model: fresh, modelVersion: MODEL_VERSION })
      .where(and(eq(guideVersions.id, versionId), eq(guideVersions.modelVersion, row.modelVersion)));
  }

  function ensureVersion(db: Database, versionId: string): Promise<void> {
    if (failed.has(versionId)) return Promise.resolve();
    const retry = retryAt.get(versionId);
    if (retry !== undefined) {
      if (now() < retry) return Promise.resolve();
      retryAt.delete(versionId);
    }
    let pending = inFlight.get(versionId);
    if (pending) {
      options.onJoin?.(versionId);
    } else {
      pending = refresh(db, versionId).finally(() => inFlight.delete(versionId));
      inFlight.set(versionId, pending);
    }
    return pending;
  }

  return {
    async ensureCurrentModel(db, run) {
      const [row] = await db
        .select({ id: guideVersions.id, modelVersion: guideVersions.modelVersion })
        .from(guideVersions)
        .where(currentVersionOf(run));
      // A missing version is loadCurrentGuide's error to report.
      if (row && row.modelVersion !== MODEL_VERSION) await ensureVersion(db, row.id);
    },
    async ensureUserModels(db, userId) {
      const stale = await db
        .select({ id: guideVersions.id })
        .from(runs)
        .innerJoin(
          guideVersions,
          and(eq(guideVersions.runId, runs.id), eq(guideVersions.version, runs.currentVersion)),
        )
        .where(and(eq(runs.userId, userId), ne(guideVersions.modelVersion, MODEL_VERSION)));
      // One guide model in memory at a time (Review Focus 5).
      for (const { id } of stale) await ensureVersion(db, id);
    },
  };
}
