import {
  guideSummary,
  setCleared,
  setPin,
  setTaskState,
  setTracked,
  type CreateRunResponseDto,
  type DryRunCreateResponseDto,
  type RunSummaryDto,
} from '@sweep/core';
import { and, desc, eq } from 'drizzle-orm';
import { Router, type RequestHandler } from 'express';
import type { Database } from '../db/client.js';
import { guideVersions, runs } from '../db/schema.js';
import { requireValidGuide, validGuide } from '../guides/core-adapter.js';
import { loadCurrentGuide, loadVersionMeta } from '../guides/store.js';
import { ApiErrorCode, HttpError } from '../http/errors.js';
import { loadRun } from '../http/load-run.js';
import { getRun, getUser } from '../http/locals.js';
import { singleUpload, type UploadParser } from '../http/upload.js';
import {
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
} from '../http/validate.js';
import type { Quotas } from '../limits.js';
import { createRun } from '../runs/create-run.js';
import { buildPayload, toRunDto } from '../runs/dto.js';
import { mutateProgress, readProgress } from '../runs/progress-store.js';
import { requireId } from '../runs/require-id.js';
import { runSummaryStats } from '../runs/summary-stats.js';

export interface RunsRouterOptions {
  db: Database;
  quotas: Quotas;
  /** Per-user upload limiter shared by both POST upload routes (spec §6.4). */
  uploadLimiter: RequestHandler;
  /** Parses the upload in a worker, one parse per user at a time (spec §6.4). */
  parseUpload: UploadParser;
}

/** One consistent snapshot across several reads: no torn view if a write lands between them. */
const SNAPSHOT = { isolationLevel: 'repeatable read', accessMode: 'read only' } as const;

export function runsRouter({ db, quotas, uploadLimiter, parseUpload }: RunsRouterOptions): Router {
  const router = Router();

  router.get('/runs', async (req, res) => {
    parseInput(noQuery, req.query);
    const userId = getUser(res).id;
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
        out.push({ ...toRunDto(row.run, row), ...runSummaryStats(guide, progress) });
      }
      return out;
    }, SNAPSHOT);
    res.json(list);
  });

  router.post('/runs', uploadLimiter, singleUpload(), async (req, res) => {
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
    const { id } = getRun(res);
    const payload = await db.transaction(async (tx) => {
      // Re-read the run inside the snapshot: the pin lives on the run row, and loadRun's copy may be stale.
      const [run] = await tx.select().from(runs).where(eq(runs.id, id));
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
    await requireId(db, run, 'leaves', sectionId);
    // setCleared also clears the pin when the pinned leaf is cleared (spec §6.2).
    await mutateProgress(db, run.id, (p) => setCleared(p, sectionId, cleared));
    res.status(204).end();
  });

  router.put('/runs/:runId/pin', async (req, res) => {
    parseInput(noQuery, req.query);
    const { sectionId } = parseInput(setPinBody, req.body);
    const run = getRun(res);
    if (sectionId !== null) await requireId(db, run, 'leaves', sectionId);
    await mutateProgress(db, run.id, (p) => setPin(p, sectionId));
    res.status(204).end();
  });

  router.put('/runs/:runId/tasks/:taskId', async (req, res) => {
    parseInput(noQuery, req.query);
    const taskId = parseInput(idSchema, req.params['taskId']);
    const { state } = parseInput(setTaskBody, req.body);
    const run = getRun(res);
    await requireId(db, run, 'tasks', taskId);
    await mutateProgress(db, run.id, (p) => setTaskState(p, taskId, state));
    res.status(204).end();
  });

  router.put('/runs/:runId/categories/:categoryId', async (req, res) => {
    parseInput(noQuery, req.query);
    const categoryId = parseInput(idSchema, req.params['categoryId']);
    const { tracked } = parseInput(setCategoryBody, req.body);
    const run = getRun(res);
    await requireId(db, run, 'categories', categoryId);
    await mutateProgress(db, run.id, (p) => setTracked(p, categoryId, tracked));
    res.status(204).end();
  });

  return router;
}
