import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type SignedIn, type TestContext } from './helpers/context.js';
import { countRows, seedRun } from './helpers/seed.js';

describe("another user's run is always 404 (spec §6.4)", () => {
  let ctx: TestContext;
  let ann: SignedIn;
  let bob: SignedIn;
  let runId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    ann = await ctx.signedInAgent('ann@example.com');
    bob = await ctx.signedInAgent('bob@example.com');
    runId = await seedRun(ctx.db, ann.userId);
  });
  afterAll(async () => {
    await ctx.close();
  });

  const cases: Array<[string, (s: SignedIn) => ReturnType<SignedIn['agent']['get']>]> = [
    ['GET run', (s) => s.agent.get(`/api/runs/${runId}`)],
    ['PATCH run', (s) => s.agent.patch(`/api/runs/${runId}`).send({ name: 'Mine now' })],
    ['DELETE run', (s) => s.agent.delete(`/api/runs/${runId}`)],
    [
      'PUT section',
      (s) => s.agent.put(`/api/runs/${runId}/sections/village`).send({ cleared: true }),
    ],
    ['PUT pin', (s) => s.agent.put(`/api/runs/${runId}/pin`).send({ sectionId: 'village' })],
    ['PUT task', (s) => s.agent.put(`/api/runs/${runId}/tasks/chest`).send({ state: 'done' })],
    [
      'PUT category',
      (s) => s.agent.put(`/api/runs/${runId}/categories/lore`).send({ tracked: true }),
    ],
  ];

  it.each(cases)('%s → 404 and writes nothing', async (_name, send) => {
    const before = await countRows(ctx.db);
    const res = await send(bob);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not-found');
    expect(await countRows(ctx.db)).toEqual(before);
  });

  it('the owner still sees the run untouched', async () => {
    const res = await ann.agent.get(`/api/runs/${runId}`);
    expect(res.status).toBe(200);
    expect(res.body.run.name).toBe('Tiny guide');
    expect(res.body.progress.cleared).toEqual([]);
  });
});
