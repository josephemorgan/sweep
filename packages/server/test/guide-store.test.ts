import { MODEL_VERSION } from '@sweep/core';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { guideVersions } from '../src/db/schema.js';
import { reparse } from '../src/guides/core-adapter.js';
import { createTestContext, type SignedIn, type TestContext } from './helpers/context.js';
import { TINY_GUIDE, TINY_YAML } from './helpers/guides.js';
import { uploadRun } from './helpers/uploads.js';

describe('re-normalization (spec §6.1 model_version)', () => {
  let ctx: TestContext;
  let ann: SignedIn;
  // Every re-parse goes through the real adapter; the hook only counts them.
  let parses = 0;
  const countingReparse: typeof reparse = (...args) => {
    parses += 1;
    return reparse(...args);
  };

  beforeAll(async () => {
    ctx = await createTestContext({ reparse: countingReparse });
    ann = await ctx.signedInAgent('ann@example.com');
  });
  afterAll(async () => {
    await ctx.close();
  });

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
    const res = await ann.agent.get(`/api/runs/${runId}`);
    expect(res.status).toBe(200);
    expect(res.body.guide).toEqual(TINY_GUIDE);
    const row = await versionRow(runId);
    expect(row.modelVersion).toBe(MODEL_VERSION);
    expect(row.model).toEqual(TINY_GUIDE);
  });

  it('serves the stored model and logs only issue codes when the source no longer parses', async () => {
    const runId = await uploadRun(ann.agent);
    await ctx.db
      .update(guideVersions)
      .set({ modelVersion: 0, source: 'sweep: 2\ngame: SECRET-GAME\n' })
      .where(eq(guideVersions.runId, runId));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const before = parses;
      const res = await ann.agent.get(`/api/runs/${runId}`);
      expect(res.status).toBe(200);
      expect(res.body.guide).toEqual(TINY_GUIDE);
      const logged = spy.mock.calls.flat().join('\n');
      expect(logged).toMatch(/re-normaliz/);
      expect(logged).not.toContain('SECRET-GAME');
      expect(parses - before).toBe(1);

      // The failure is remembered: later requests serve the stored model without a new worker.
      const again = await ann.agent.get(`/api/runs/${runId}`);
      expect(again.status).toBe(200);
      expect(again.body.guide).toEqual(TINY_GUIDE);
      expect(parses - before).toBe(1);
      expect((await versionRow(runId)).modelVersion).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('shares one parse between concurrent requests for the same stale version', async () => {
    const runId = await uploadRun(ann.agent);
    await makeStale(runId);
    const before = parses;
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
