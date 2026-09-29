import { MODEL_VERSION } from '@sweep/core';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { guideVersions } from '../src/db/schema.js';
import { reparse } from '../src/guides/core-adapter.js';
import { RENORMALIZE_RETRY_MS } from '../src/limits.js';
import { createTestContext, type SignedIn, type TestContext } from './helpers/context.js';
import { TINY_GUIDE, TINY_YAML } from './helpers/guides.js';
import { uploadRun } from './helpers/uploads.js';

describe('re-normalization (spec §6.1 model_version)', () => {
  let ctx: TestContext;
  let ann: SignedIn;
  // Every re-parse goes through the real adapter. The hook counts them, and a test can queue
  // an override for the next parse (the adapter with other options, or held on a gate).
  let parses = 0;
  const overrides: (typeof reparse)[] = [];
  let clock = 0;
  let onJoin = (): void => undefined;

  beforeAll(async () => {
    ctx = await createTestContext({
      renormalize: {
        reparse: (...args) => {
          parses += 1;
          return (overrides.shift() ?? reparse)(...args);
        },
        now: () => clock,
        onJoin: () => onJoin(),
      },
    });
    ann = await ctx.signedInAgent('ann@example.com');
  });
  beforeEach(() => {
    overrides.length = 0;
    onJoin = () => undefined;
  });
  afterAll(async () => {
    await ctx.close();
  });

  /** Captures console.error for the test (and keeps the output clean). */
  const captureErrors = () => vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const makeStale = (runId: string) =>
    ctx.db
      .update(guideVersions)
      .set({ modelVersion: 0, model: sql`'{"stale": true}'::jsonb` })
      .where(eq(guideVersions.runId, runId));

  const versionRow = async (runId: string) =>
    (await ctx.db.select().from(guideVersions).where(eq(guideVersions.runId, runId)))[0]!;

  it('re-parses the source when model_version is stale and stores the fresh model', async () => {
    const runId = await uploadRun(ann.agent);
    await makeStale(runId);
    await ctx.db
      .update(guideVersions)
      .set({ game: 'Stale game', title: 'Stale title' })
      .where(eq(guideVersions.runId, runId));
    const res = await ann.agent.get(`/api/runs/${runId}`);
    expect(res.status).toBe(200);
    expect(res.body.guide).toEqual(TINY_GUIDE);
    const row = await versionRow(runId);
    expect(row.modelVersion).toBe(MODEL_VERSION);
    expect(row.model).toEqual(TINY_GUIDE);
    // The denormalized columns follow the fresh model.
    expect({ game: row.game, title: row.title }).toEqual({
      game: TINY_GUIDE.game,
      title: TINY_GUIDE.title,
    });
  });

  it('serves the stored model and logs only issue codes when the source no longer parses', async () => {
    const runId = await uploadRun(ann.agent);
    await ctx.db
      .update(guideVersions)
      .set({ modelVersion: 0, source: 'sweep: 2\ngame: SECRET-GAME\n' })
      .where(eq(guideVersions.runId, runId));
    const spy = captureErrors();
    try {
      const before = parses;
      const res = await ann.agent.get(`/api/runs/${runId}`);
      expect(res.status).toBe(200);
      expect(res.body.guide).toEqual(TINY_GUIDE);
      const logged = spy.mock.calls.flat().join('\n');
      expect(logged).toMatch(/re-normaliz/);
      expect(logged).not.toContain('SECRET-GAME');
      expect(parses - before).toBe(1);

      // A deterministic failure is remembered: later requests, even long after, don't re-parse.
      const again = await ann.agent.get(`/api/runs/${runId}`);
      expect(again.status).toBe(200);
      expect(again.body.guide).toEqual(TINY_GUIDE);
      clock += RENORMALIZE_RETRY_MS * 10;
      expect((await ann.agent.get(`/api/runs/${runId}`)).status).toBe(200);
      expect(parses - before).toBe(1);
      expect((await versionRow(runId)).modelVersion).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it.each([
    [
      'the worker fails',
      ((source, fileName, options) =>
        reparse(source, fileName, {
          ...options,
          workerUrl: new URL('./helpers/no-such-worker.ts', import.meta.url),
        })) satisfies typeof reparse,
      /guide parse worker failed/,
    ],
    [
      'the parse times out',
      ((source, fileName, options) =>
        reparse(source, fileName, { ...options, timeoutMs: 1 })) satisfies typeof reparse,
      /time budget/,
    ],
  ])('backs off for a while, then re-parses, when %s', async (_, failing, logged) => {
    const runId = await uploadRun(ann.agent);
    await makeStale(runId);
    const spy = captureErrors();
    try {
      const before = parses;
      overrides.push(failing);
      const first = await ann.agent.get(`/api/runs/${runId}`);
      expect(first.status).toBe(200);
      expect(first.body.guide).toEqual({ stale: true });
      expect(parses - before).toBe(1);
      const log = spy.mock.calls.flat().join('\n');
      expect(log).toMatch(/re-normaliz.*retrying in 60 s/s);
      expect(log).toMatch(logged);

      // Within the backoff: the stored model, no new worker.
      clock += RENORMALIZE_RETRY_MS - 1;
      const within = await ann.agent.get(`/api/runs/${runId}`);
      expect(within.body.guide).toEqual({ stale: true });
      expect(parses - before).toBe(1);

      // After it: the next request re-parses and stores the fresh model.
      clock += 1;
      const after = await ann.agent.get(`/api/runs/${runId}`);
      expect(after.status).toBe(200);
      expect(after.body.guide).toEqual(TINY_GUIDE);
      expect(parses - before).toBe(2);
      expect((await versionRow(runId)).modelVersion).toBe(MODEL_VERSION);
    } finally {
      spy.mockRestore();
    }
  });

  it('shares one parse between concurrent requests for the same stale version', async () => {
    const runId = await uploadRun(ann.agent);
    await makeStale(runId);
    const before = parses;
    // Hold the first parse until the second request has either joined it (shared) or started a
    // parse of its own (not shared), so the two requests are sure to overlap.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    onJoin = release;
    overrides.push(
      async (...args) => {
        await gate;
        return reparse(...args);
      },
      (...args) => {
        release();
        return reparse(...args);
      },
    );
    const [a, b] = await Promise.all([
      ann.agent.get(`/api/runs/${runId}`),
      ann.agent.get(`/api/runs/${runId}`),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.guide).toEqual(TINY_GUIDE);
    expect(b.body.guide).toEqual(TINY_GUIDE);
    expect(parses - before).toBe(1);
  });

  it('re-normalizes before listing runs', async () => {
    const { agent } = await ctx.signedInAgent('bea@example.com');
    const stale = await uploadRun(agent);
    const fresh = await uploadRun(agent);
    await makeStale(stale);
    const before = parses;
    const res = await agent.get('/api/runs');
    expect(res.status).toBe(200);
    expect(res.body.map((r: { id: string }) => r.id).sort()).toEqual([stale, fresh].sort());
    expect(parses - before).toBe(1);
    expect((await versionRow(stale)).model).toEqual(TINY_GUIDE);
  });

  it('re-normalizes before a progress write checks its target', async () => {
    const runId = await uploadRun(ann.agent);
    await makeStale(runId);
    const res = await ann.agent.put(`/api/runs/${runId}/sections/village`).send({ cleared: true });
    expect(res.status).toBe(204);
    expect((await versionRow(runId)).modelVersion).toBe(MODEL_VERSION);
  });

  it('re-normalizes before previewing a guide update', async () => {
    const runId = await uploadRun(ann.agent);
    await makeStale(runId);
    const res = await ann.agent
      .post(`/api/runs/${runId}/guide?dryRun=true`)
      .field('baseVersion', '1')
      .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(res.status).toBe(200);
    expect(res.body.diff).not.toBeNull();
    expect((await versionRow(runId)).modelVersion).toBe(MODEL_VERSION);
  });
});
