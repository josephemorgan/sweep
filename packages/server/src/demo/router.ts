// The demo runs router (spec §6.6): the same paths, validation and status codes as
// src/routes/runs.ts, served from an in-memory sandbox keyed by the session. Nothing is written
// to Postgres.
import {
  diffGuides,
  guideSummary,
  progressToDto,
  setCleared,
  setPin,
  setTaskState,
  setTracked,
  type CreateRunResponseDto,
  type DryRunCreateResponseDto,
  type DryRunUpdateResponseDto,
  type Guide,
  type RunPayloadDto,
  type RunSummaryDto,
} from '@sweep/core';
import { Router, type RequestHandler, type Response } from 'express';
import { requireValidGuide, validGuide } from '../guides/core-adapter.js';
import { ApiErrorCode, HttpError } from '../http/errors.js';
import { getUser } from '../http/locals.js';
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
  UUID_PATTERN,
} from '../http/validate.js';
import { toRunDto } from '../runs/dto.js';
import { indexGuide } from '../runs/guide-index.js';
import { requireIdIn, type IdKind } from '../runs/require-id.js';
import { runSummaryStats } from '../runs/summary-stats.js';
import { staleVersion } from '../runs/update-guide.js';
import type { DemoRun, DemoSandbox, DemoSandboxes } from './sandbox.js';

export interface DemoRunsRouterOptions {
  sandboxes: DemoSandboxes;
  /** Per-user upload limiter shared by both POST upload routes. */
  uploadLimiter: RequestHandler;
  parseUpload: UploadParser;
}

const DEMO_RUN_KEY = 'sweepDemoRun';

function setDemoRun(res: Response, run: DemoRun): void {
  res.locals[DEMO_RUN_KEY] = run;
}

function getDemoRun(res: Response): DemoRun {
  const run: unknown = res.locals[DEMO_RUN_KEY];
  if (!run) throw new Error('getDemoRun: the run guard has not run for this route.');
  return run as DemoRun;
}

function currentGuide(run: DemoRun): Guide {
  const current = run.versions[run.versions.length - 1];
  if (!current) throw new Error('demo run has no versions');
  return current.guide;
}

function metaOf(run: DemoRun): { game: string; title: string } {
  const guide = currentGuide(run);
  return { game: guide.game, title: guide.title };
}

function payloadOf(run: DemoRun): RunPayloadDto {
  return {
    run: toRunDto(run.row, metaOf(run)),
    guide: currentGuide(run),
    progress: progressToDto(run.progress),
  };
}

export function demoRunsRouter({
  sandboxes,
  uploadLimiter,
  parseUpload,
}: DemoRunsRouterOptions): Router {
  const router = Router();

  const sandboxOf = (res: Response): DemoSandbox => {
    const user = getUser(res);
    return sandboxes.get(user.sessionId, user.id);
  };

  /** Write targets must exist with the right kind in the current guide (422), as in runs.ts. */
  const requireId = (run: DemoRun, kind: IdKind, id: string): void =>
    requireIdIn(indexGuide(currentGuide(run)), kind, id);

  router.get('/runs', (req, res) => {
    parseInput(noQuery, req.query);
    const out: RunSummaryDto[] = sandboxOf(res)
      .list()
      .map((run) => ({
        ...toRunDto(run.row, metaOf(run)),
        ...runSummaryStats(currentGuide(run), run.progress),
      }));
    res.json(out);
  });

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
    const run = sandboxOf(res).createRun({ name: fields.name, upload, guide });
    const body: CreateRunResponseDto = { runId: run.row.id };
    res.status(201).json(body);
  });

  router.use('/runs/:runId', (req, res, next) => {
    const runId = req.params['runId'];
    const run =
      typeof runId === 'string' && UUID_PATTERN.test(runId)
        ? sandboxOf(res).find(runId)
        : undefined;
    if (!run) throw new HttpError(404, ApiErrorCode.NotFound, 'No such run.');
    setDemoRun(res, run);
    next();
  });

  router.get('/runs/:runId', (req, res) => {
    parseInput(noQuery, req.query);
    res.json(payloadOf(getDemoRun(res)));
  });

  router.patch('/runs/:runId', (req, res) => {
    parseInput(noQuery, req.query);
    const { name } = parseInput(renameRunBody, req.body);
    const run = sandboxOf(res).rename(getDemoRun(res).row.id, name);
    res.json(toRunDto(run.row, metaOf(run)));
  });

  router.delete('/runs/:runId', (req, res) => {
    parseInput(noQuery, req.query);
    sandboxOf(res).delete(getDemoRun(res).row.id);
    res.status(204).end();
  });

  router.put('/runs/:runId/sections/:sectionId', (req, res) => {
    parseInput(noQuery, req.query);
    const sectionId = parseInput(idSchema, req.params['sectionId']);
    const { cleared } = parseInput(setSectionBody, req.body);
    const run = getDemoRun(res);
    requireId(run, 'leaves', sectionId);
    sandboxOf(res).mutateProgress(run.row.id, (p) => setCleared(p, sectionId, cleared));
    res.status(204).end();
  });

  router.put('/runs/:runId/pin', (req, res) => {
    parseInput(noQuery, req.query);
    const { sectionId } = parseInput(setPinBody, req.body);
    const run = getDemoRun(res);
    if (sectionId !== null) requireId(run, 'leaves', sectionId);
    sandboxOf(res).mutateProgress(run.row.id, (p) => setPin(p, sectionId));
    res.status(204).end();
  });

  router.put('/runs/:runId/tasks/:taskId', (req, res) => {
    parseInput(noQuery, req.query);
    const taskId = parseInput(idSchema, req.params['taskId']);
    const { state } = parseInput(setTaskBody, req.body);
    const run = getDemoRun(res);
    requireId(run, 'tasks', taskId);
    sandboxOf(res).mutateProgress(run.row.id, (p) => setTaskState(p, taskId, state));
    res.status(204).end();
  });

  router.put('/runs/:runId/categories/:categoryId', (req, res) => {
    parseInput(noQuery, req.query);
    const categoryId = parseInput(idSchema, req.params['categoryId']);
    const { tracked } = parseInput(setCategoryBody, req.body);
    const run = getDemoRun(res);
    requireId(run, 'categories', categoryId);
    sandboxOf(res).mutateProgress(run.row.id, (p) => setTracked(p, categoryId, tracked));
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
      const run = getDemoRun(res);
      if (baseVersion !== run.row.currentVersion) throw staleVersion();
      const upload = await parseUpload(req, res);
      // The parse awaits; another request on this sandbox may have advanced the version.
      if (baseVersion !== run.row.currentVersion) throw staleVersion();
      if (dryRun) {
        const next = validGuide(upload.result);
        const body: DryRunUpdateResponseDto = {
          issues: upload.result.issues,
          diff: next ? diffGuides(currentGuide(run), next, run.progress) : null,
        };
        res.json(body);
        return;
      }
      const guide = requireValidGuide(upload.result);
      const updated = sandboxOf(res).addVersion(run.row.id, { upload, guide, baseVersion });
      res.json(payloadOf(updated));
    },
  );

  return router;
}
