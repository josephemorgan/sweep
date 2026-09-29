import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runs } from '../src/db/schema.js';
import { createTestContext, type SignedIn, type TestContext } from './helpers/context.js';
import { seedRun } from './helpers/seed.js';

describe('progress writes', () => {
  let ctx: TestContext;
  let ann: SignedIn;
  let runId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    ann = await ctx.signedInAgent('ann@example.com');
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    runId = await seedRun(ctx.db, ann.userId);
  });

  const progressOf = async (): Promise<unknown> =>
    (await ann.agent.get(`/api/runs/${runId}`)).body.progress;

  it('clears and un-clears a leaf', async () => {
    expect(
      (await ann.agent.put(`/api/runs/${runId}/sections/village`).send({ cleared: true })).status,
    ).toBe(204);
    expect(await progressOf()).toMatchObject({ cleared: ['village'] });
    await ann.agent.put(`/api/runs/${runId}/sections/village`).send({ cleared: false }).expect(204);
    expect(await progressOf()).toMatchObject({ cleared: [] });
  });

  it('clearing the pinned leaf also clears the pin', async () => {
    await ann.agent.put(`/api/runs/${runId}/pin`).send({ sectionId: 'marsh' }).expect(204);
    expect(await progressOf()).toMatchObject({ pin: 'marsh' });
    await ann.agent.put(`/api/runs/${runId}/sections/marsh`).send({ cleared: true }).expect(204);
    expect(await progressOf()).toMatchObject({ pin: null, cleared: ['marsh'] });
  });

  it('pins and unpins', async () => {
    await ann.agent.put(`/api/runs/${runId}/pin`).send({ sectionId: 'keep' }).expect(204);
    await ann.agent.put(`/api/runs/${runId}/pin`).send({ sectionId: null }).expect(204);
    expect(await progressOf()).toMatchObject({ pin: null });
  });

  it('sets and removes task states', async () => {
    await ann.agent.put(`/api/runs/${runId}/tasks/chest`).send({ state: 'done' }).expect(204);
    await ann.agent.put(`/api/runs/${runId}/tasks/herbs`).send({ state: 'dont-care' }).expect(204);
    expect(await progressOf()).toMatchObject({ tasks: { chest: 'done', herbs: 'dont-care' } });
    await ann.agent.put(`/api/runs/${runId}/tasks/chest`).send({ state: null }).expect(204);
    expect(await progressOf()).toMatchObject({ tasks: { herbs: 'dont-care' } });
  });

  it('overrides and resets category tracking', async () => {
    await ann.agent.put(`/api/runs/${runId}/categories/lore`).send({ tracked: true }).expect(204);
    expect(await progressOf()).toMatchObject({ tracked: { lore: true } });
    await ann.agent.put(`/api/runs/${runId}/categories/lore`).send({ tracked: null }).expect(204);
    expect(await progressOf()).toMatchObject({ tracked: {} });
  });

  it('bumps updated_at on every progress write', async () => {
    const old = new Date('2000-01-01T00:00:00Z');
    await ctx.db.update(runs).set({ updatedAt: old }).where(eq(runs.id, runId));
    await ann.agent.put(`/api/runs/${runId}/tasks/chest`).send({ state: 'done' }).expect(204);
    const [row] = await ctx.db.select().from(runs).where(eq(runs.id, runId));
    expect(row!.updatedAt.getTime()).toBeGreaterThan(old.getTime());
  });

  it('rejects an unknown query key with 400 and writes nothing', async () => {
    const res = await ann.agent.put(`/api/runs/${runId}/tasks/chest?x=1`).send({ state: 'done' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad-request');
    expect(await progressOf()).toMatchObject({ tasks: {} });
  });

  it.each([
    ['sections/act-1', { cleared: true }],
    ['sections/ghost', { cleared: true }],
    ['sections/chest', { cleared: true }],
    ['pin', { sectionId: 'act-1' }],
    ['pin', { sectionId: 'ghost' }],
    ['tasks/village', { state: 'done' }],
    ['tasks/ghost', { state: 'done' }],
    ['categories/ghost', { tracked: true }],
  ])('answers PUT %s %j with 422 unknown-id', async (path, body) => {
    const res = await ann.agent.put(`/api/runs/${runId}/${path}`).send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('unknown-id');
  });

  it.each([
    ['sections/Village', { cleared: true }],
    ['sections/' + 'a'.repeat(65), { cleared: true }],
    ['sections/village', { cleared: 'yes' }],
    ['sections/village', {}],
    ['pin', { sectionId: 'Bad_Id' }],
    ['pin', {}],
    ['tasks/chest', { state: 'missed' }],
    ['tasks/chest', { state: 'done', extra: true }],
    ['categories/lore', { tracked: 'true' }],
  ])('answers PUT %s %j with 400 bad-request', async (path, body) => {
    const res = await ann.agent.put(`/api/runs/${runId}/${path}`).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad-request');
  });

  it('keeps every concurrent write to one run (Review Focus 2)', async () => {
    for (let round = 0; round < 5; round += 1) {
      const id = await seedRun(ctx.db, ann.userId);
      const put = (path: string, body: object): Promise<unknown> =>
        ann.agent.put(`/api/runs/${id}/${path}`).send(body).expect(204).then();
      await Promise.all([
        put('pin', { sectionId: 'keep' }),
        put('sections/village', { cleared: true }),
        put('sections/marsh', { cleared: true }),
        put('tasks/chest', { state: 'done' }),
        put('tasks/herbs', { state: 'dont-care' }),
        put('tasks/book', { state: 'done' }),
        put('categories/lore', { tracked: true }),
        put('categories/loot', { tracked: false }),
      ]);
      const res = await ann.agent.get(`/api/runs/${id}`);
      expect(res.body.progress).toEqual({
        cleared: ['marsh', 'village'],
        pin: 'keep',
        tasks: { book: 'done', chest: 'done', herbs: 'dont-care' },
        tracked: { loot: false, lore: true },
      });
    }
  });
});
