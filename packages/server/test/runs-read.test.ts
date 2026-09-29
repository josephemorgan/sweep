import { emptyProgress } from '@sweep/core';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runs } from '../src/db/schema.js';
import { RUN_NAME_MAX_LENGTH } from '../src/http/validate.js';
import { writeProgressChanges } from '../src/runs/progress-store.js';
import { createTestContext, type SignedIn, type TestContext } from './helpers/context.js';
import { TINY_GUIDE } from './helpers/guides.js';
import { countRows, seedRun } from './helpers/seed.js';

describe('runs read, rename and delete', () => {
  let ctx: TestContext;
  let ann: SignedIn;
  let bob: SignedIn;

  beforeAll(async () => {
    ctx = await createTestContext();
    ann = await ctx.signedInAgent('ann@example.com');
    bob = await ctx.signedInAgent('bob@example.com');
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('returns the run payload the client engine runs on', async () => {
    const runId = await seedRun(ctx.db, ann.userId, { name: 'My run' });
    await writeProgressChanges(ctx.db, runId, emptyProgress(), {
      ...emptyProgress(),
      cleared: new Set(['village']),
      pin: 'marsh',
      tasks: new Map([['chest', 'done']]),
    });
    const res = await ann.agent.get(`/api/runs/${runId}`);
    expect(res.status).toBe(200);
    expect(res.body.run).toEqual({
      id: runId,
      name: 'My run',
      game: 'Test Game',
      title: 'Tiny guide',
      currentVersion: 1,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(res.body.guide).toEqual(TINY_GUIDE);
    expect(res.body.progress).toEqual({
      cleared: ['village'],
      pin: 'marsh',
      tasks: { chest: 'done' },
      tracked: {},
    });
  });

  it('lists 50 runs (the per-user quota) newest-played first, with stats', async () => {
    const lister = await ctx.signedInAgent('lister@example.com');
    const ids: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      const runId = await seedRun(ctx.db, lister.userId, { name: `Run ${i}` });
      await ctx.db
        .update(runs)
        .set({ updatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)) })
        .where(eq(runs.id, runId));
      ids.push(runId);
    }
    await writeProgressChanges(ctx.db, ids[49]!, emptyProgress(), {
      ...emptyProgress(),
      cleared: new Set(['village', 'marsh']),
      tasks: new Map([['herbs', 'done']]),
    });

    const res = await lister.agent.get('/api/runs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(50);
    expect(res.body.map((r: { id: string }) => r.id)).toEqual([...ids].reverse());
    expect(res.body[0]).toMatchObject({
      id: ids[49],
      leavesCleared: 2,
      leavesTotal: 3,
      tasksDone: 1,
      tasksTotal: 2,
      game: 'Test Game',
      title: 'Tiny guide',
    });
  });

  it("never lists another user's runs", async () => {
    await seedRun(ctx.db, ann.userId);
    const res = await bob.agent.get('/api/runs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('renames a run with a trimmed name', async () => {
    const runId = await seedRun(ctx.db, ann.userId);
    const res = await ann.agent.patch(`/api/runs/${runId}`).send({ name: '  Second try  ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: runId, name: 'Second try', game: 'Test Game' });
  });

  it.each([
    { name: '' },
    { name: '   ' },
    { name: 'x'.repeat(RUN_NAME_MAX_LENGTH + 1) },
    { name: '🗺'.repeat(RUN_NAME_MAX_LENGTH + 1) },
    { name: 'a\u0000b' },
    { name: 'a\nb' },
    { name: 'a\u001bb' },
    { name: 5 },
    {},
    { name: 'ok', extra: 1 },
  ])('rejects rename body %j with 400', async (body) => {
    const runId = await seedRun(ctx.db, ann.userId);
    const res = await ann.agent.patch(`/api/runs/${runId}`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad-request');
  });

  it.each(['x'.repeat(RUN_NAME_MAX_LENGTH), '🗺'.repeat(RUN_NAME_MAX_LENGTH)])(
    'accepts a name of exactly the maximum length in characters (%#)',
    async (name) => {
      const runId = await seedRun(ctx.db, ann.userId);
      const res = await ann.agent.patch(`/api/runs/${runId}`).send({ name });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe(name);
    },
  );

  it('rejects any query key with 400 on a read and on a mutation', async () => {
    const runId = await seedRun(ctx.db, ann.userId);
    const list = await ann.agent.get('/api/runs?x=1');
    expect(list.status).toBe(400);
    expect(list.body.error.code).toBe('bad-request');
    const payload = await ann.agent.get(`/api/runs/${runId}?x=1`);
    expect(payload.status).toBe(400);
    const rename = await ann.agent.patch(`/api/runs/${runId}?x=1`).send({ name: 'Nope' });
    expect(rename.status).toBe(400);
    expect(rename.body.error.code).toBe('bad-request');
    const del = await ann.agent.delete(`/api/runs/${runId}?x=1`);
    expect(del.status).toBe(400);
    expect((await ann.agent.get(`/api/runs/${runId}`)).status).toBe(200);
  });

  it('deletes a run with its versions and progress', async () => {
    const runId = await seedRun(ctx.db, ann.userId);
    await writeProgressChanges(ctx.db, runId, emptyProgress(), {
      cleared: new Set(['village']),
      pin: null,
      tasks: new Map([['chest', 'done']]),
      tracked: new Map([['lore', true]]),
    });
    const before = await countRows(ctx.db);
    const res = await ann.agent.delete(`/api/runs/${runId}`);
    expect(res.status).toBe(204);
    const after = await countRows(ctx.db);
    expect(after['runs']).toBe(before['runs']! - 1);
    expect(after['guide_versions']).toBe(before['guide_versions']! - 1);
    expect(after['section_progress']).toBe(before['section_progress']! - 1);
    expect(after['task_progress']).toBe(before['task_progress']! - 1);
    expect(after['category_prefs']).toBe(before['category_prefs']! - 1);
    expect((await ann.agent.get(`/api/runs/${runId}`)).status).toBe(404);
  });

  it("answers another user's run with 404 on GET, PATCH and DELETE", async () => {
    const runId = await seedRun(ctx.db, ann.userId);
    expect((await bob.agent.get(`/api/runs/${runId}`)).status).toBe(404);
    expect((await bob.agent.patch(`/api/runs/${runId}`).send({ name: 'Mine' })).status).toBe(404);
    expect((await bob.agent.delete(`/api/runs/${runId}`)).status).toBe(404);
    expect((await ann.agent.get(`/api/runs/${runId}`)).status).toBe(200);
  });

  it('answers a malformed run ID with 404, not 400 or 500', async () => {
    const res = await ann.agent.get('/api/runs/not-a-uuid');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not-found');
  });

  it('requires a session', async () => {
    const res = await request(ctx.app).get('/api/runs');
    expect(res.status).toBe(401);
  });
});
