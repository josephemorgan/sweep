import {
  guideSummary,
  setCleared,
  setPin,
  setTaskState,
  setTracked,
  type CreateRunResponseDto,
  type DryRunCreateResponseDto,
  type Guide,
  type RunProgress,
  type RunSummary,
  type RunSummaryDto,
} from '@sweep/core';
import { and, desc, eq } from 'drizzle-orm';
import { Router, type RequestHandler } from 'express';
import type { Database } from '../db/client.js';
import { guideVersions, runs } from '../db/schema.js';
import { requireValidGuide, validGuide } from '../guides/core-adapter.js';
import type { Renormalizer } from '../guides/renormalize.js';
import { loadCurrentGuide, loadVersionMeta } from '../guides/store.js';
import { describeError } from '../http/error-handler.js';
import { ApiErrorCode, HttpError } from '../http/errors.js';
import { loadRun } from '../http/load-run.js';
import { getRun, getUser } from '../http/locals.js';
import { singleUpload, type UploadParser } from '../http/upload.js';
import {
  checkQuery,
  createRunFields,
  dryRunQuery,
  idSchema,
  noQuery,
  parseInput,
  renameRunBody,
  setCategoryBody,
  setPinBody,
  setSectionBody,
  setTaskBody,
  updateGuideFields,
} from '../http/validate.js';
import type { Quotas } from '../limits.js';
import { createRun } from '../runs/create-run.js';
import { buildPayload, toRunDto } from '../runs/dto.js';
import { mutateProgress, readProgress } from '../runs/progress-store.js';
import { requireId } from '../runs/require-id.js';
import { runSummaryStats } from '../runs/summary-stats.js';
import { applyGuideUpdate, previewGuideUpdate, staleVersion } from '../runs/update-guide.js';

export interface RunsRouterOptions {
  db: Database;
  quotas: Quotas;
  /** Per-user upload limiter shared by both POST upload routes (spec §6.4). */
  uploadLimiter: RequestHandler;
  /** Parses the upload in a worker, one parse per user at a time (spec §6.4). */
  parseUpload: UploadParser;
  /** Re-normalizes stale stored models; called before each transaction that loads the guide. */
  models: Renormalizer;
}

/**
 * A run's list stats, or zeros if the engine throws on its model (say a stored model a
 * re-normalization couldn't replace): one broken run must not fail the whole list.
 */
function listStats(runId: string, guide: Guide, progress: RunProgress): RunSummary {
  try {
    return runSummaryStats(guide, progress);
  } catch (err) {
    console.error(
      `runs list: computing stats for run ${runId} failed; listing it with zero stats. ${describeError(err)}`,
    );
    return { leavesCleared: 0, leavesTotal: 0, tasksDone: 0, tasksTotal: 0 };
  }
}

/** One consistent snapshot across several reads: no torn view if a write lands between them. */
const SNAPSHOT = { isolationLevel: 'repeatable read', accessMode: 'read only' } as const;

export function runsRouter({
  db,
  quotas,
  uploadLimiter,
  parseUpload,
  models,
}: RunsRouterOptions): Router {
  const router = Router();

  router.get('/runs', async (req, res) => {
    parseInput(noQuery, req.query);
    const userId = getUser(res).id;
    await models.ensureUserModels(db, userId);
    const list = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ run: runs, game: guideVersions.game, title: guideVersions.title })
        .from(runs)
        .innerJoin(
          guideVersions,
          and(eq(guideVersions.runId, runs.id), eq(guideVersions.version, runs.currentVersion)),
        )
        .where(eq(runs.userId, userId))
        .orderBy(desc(runs.updatedAt), desc(runs.id));
      // One guide model in memory at a time: models can be several MB (Review Focus 5).
      const out: RunSummaryDto[] = [];
      for (const row of rows) {
        const { guide } = await loadCurrentGuide(tx, row.run);
        const progress = await readProgress(tx, row.run.id);
        out.push({ ...toRunDto(row.run, row), ...listStats(row.run.id, guide, progress) });
      }
      return out;
    }, SNAPSHOT);
    res.json(list);
  });

  // The query is checked before the limiter and multer: a bad one costs no upload.
  router.post('/runs', checkQuery(dryRunQuery), uploadLimiter, singleUpload(), async (req, res) => {
    const { dryRun } = parseInput(dryRunQuery, req.query);
    const fields = parseInput(createRunFields, req.body ?? {});
    const upload = await parseUpload(req, res);
    if (dryRun) {
      const guide = validGuide(upload.result);
      const body: DryRunCreateResponseDto = {
        issues: upload.result.issues,
        summary: guide ? guideSummary(guide) : null,
      };
      res.json(body);
      return;
    }
    const guide = requireValidGuide(upload.result);
    const runId = await createRun(db, {
      userId: getUser(res).id,
      upload,
      guide,
      name: fields.name,
      quotas,
    });
    const body: CreateRunResponseDto = { runId };
    res.status(201).json(body);
  });

  // Ownership guard for every /runs/:runId route (spec §6.4).
  router.use('/runs/:runId', loadRun(db));

  router.get('/runs/:runId', async (req, res) => {
    parseInput(noQuery, req.query);
    const loaded = getRun(res);
    await models.ensureCurrentModel(db, loaded);
    const payload = await db.transaction(async (tx) => {
      // Re-read the run inside the snapshot: the pin lives on the run row, and loadRun's copy may be stale.
      const [run] = await tx.select().from(runs).where(eq(runs.id, loaded.id));
      if (!run) throw new HttpError(404, ApiErrorCode.NotFound, 'No such run.');
      return buildPayload(tx, run);
    }, SNAPSHOT);
    res.json(payload);
  });

  router.patch('/runs/:runId', async (req, res) => {
    parseInput(noQuery, req.query);
    const { name } = parseInput(renameRunBody, req.body);
    const run = getRun(res);
    // A rename isn't play: updated_at ("last played") is left alone.
    const [updated] = await db.update(runs).set({ name }).where(eq(runs.id, run.id)).returning();
    if (!updated) throw new HttpError(404, ApiErrorCode.NotFound, 'No such run.');
    res.json(toRunDto(updated, await loadVersionMeta(db, updated)));
  });

  router.delete('/runs/:runId', async (req, res) => {
    parseInput(noQuery, req.query);
    await db.delete(runs).where(eq(runs.id, getRun(res).id));
    res.status(204).end();
  });

  router.put('/runs/:runId/sections/:sectionId', async (req, res) => {
    parseInput(noQuery, req.query);
    const sectionId = parseInput(idSchema, req.params['sectionId']);
    const { cleared } = parseInput(setSectionBody, req.body);
    const run = getRun(res);
    await models.ensureCurrentModel(db, run);
    // setCleared also clears the pin when the pinned leaf is cleared (spec §6.2).
    await mutateProgress(
      db,
      run.id,
      (p) => setCleared(p, sectionId, cleared),
      (tx, locked) => requireId(tx, locked, 'leaves', sectionId),
    );
    res.status(204).end();
  });

  router.put('/runs/:runId/pin', async (req, res) => {
    parseInput(noQuery, req.query);
    const { sectionId } = parseInput(setPinBody, req.body);
    const run = getRun(res);
    await models.ensureCurrentModel(db, run);
    await mutateProgress(
      db,
      run.id,
      (p) => setPin(p, sectionId),
      (tx, locked) =>
        sectionId === null ? Promise.resolve() : requireId(tx, locked, 'leaves', sectionId),
    );
    res.status(204).end();
  });

  router.put('/runs/:runId/tasks/:taskId', async (req, res) => {
    parseInput(noQuery, req.query);
    const taskId = parseInput(idSchema, req.params['taskId']);
    const { state } = parseInput(setTaskBody, req.body);
    const run = getRun(res);
    await models.ensureCurrentModel(db, run);
    await mutateProgress(
      db,
      run.id,
      (p) => setTaskState(p, taskId, state),
      (tx, locked) => requireId(tx, locked, 'tasks', taskId),
    );
    res.status(204).end();
  });

  router.put('/runs/:runId/categories/:categoryId', async (req, res) => {
    parseInput(noQuery, req.query);
    const categoryId = parseInput(idSchema, req.params['categoryId']);
    const { tracked } = parseInput(setCategoryBody, req.body);
    const run = getRun(res);
    await models.ensureCurrentModel(db, run);
    await mutateProgress(
      db,
      run.id,
      (p) => setTracked(p, categoryId, tracked),
      (tx, locked) => requireId(tx, locked, 'categories', categoryId),
    );
    res.status(204).end();
  });

  router.post(
    '/runs/:runId/guide',
    checkQuery(dryRunQuery),
    uploadLimiter,
    singleUpload(),
    async (req, res) => {
      const { dryRun } = parseInput(dryRunQuery, req.query);
      const { baseVersion } = parseInput(updateGuideFields, req.body ?? {});
      const run = getRun(res);
      // Checked again under the run lock (apply) or in the preview's snapshot; this one saves a parse.
      if (baseVersion !== run.currentVersion) throw staleVersion();
      const upload = await parseUpload(req, res);
      await models.ensureCurrentModel(db, run);
      if (dryRun) {
        res.json(await previewGuideUpdate(db, run, upload));
        return;
      }
      // A parse over its time budget is the single `limit` issue: 422 like any invalid guide.
      const guide = requireValidGuide(upload.result);
      const body = await applyGuideUpdate(db, run.id, {
        userId: getUser(res).id,
        upload,
        guide,
        baseVersion,
        quotas,
      });
      res.json(body);
    },
  );

  return router;
}
