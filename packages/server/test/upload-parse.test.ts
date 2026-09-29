import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestContext, type SignedIn, type TestContext } from './helpers/context.js';
import { CRASH_EXIT, CRASH_THROW, deeplyNestedMd, TINY_YAML } from './helpers/guides.js';
import { countRows } from './helpers/seed.js';
import { CRASH_WORKER_URL, nextWorker } from './helpers/workers.js';

const NESTED = Buffer.from(deeplyNestedMd());
const TINY = Buffer.from(TINY_YAML);
// Slow through depth (over 10 s to parse in full), so it hits the context's budget, not a short one.
const SLOW = Buffer.from(deeplyNestedMd(10_000));

/** Spec §6.4: uploads parse in a worker, with a time budget and one parse per user at a time. */
describe('upload parsing in a worker (spec §6.4)', () => {
  describe('time budget', () => {
    let ctx: TestContext;
    let ann: SignedIn;
    beforeAll(async () => {
      ctx = await createTestContext({ parseTimeoutMs: 200 });
      ann = await ctx.signedInAgent('ann@example.com');
    });
    afterAll(async () => {
      await ctx.close();
    });

    const LIMIT_ISSUE = {
      severity: 'error',
      code: 'limit',
      message: 'the guide took too long to parse (over 0.2 s)',
      file: null,
      line: null,
      column: null,
      path: null,
    };

    it('create: a parse over budget is 422 with one limit issue, fast, writing nothing', async () => {
      const before = await countRows(ctx.db);
      const next = nextWorker();
      const started = performance.now();
      const res = await ann.agent.post('/api/runs').attach('file', NESTED, 'slow.md');
      // The full parse takes well over 10 s: only terminating the worker answers this fast.
      expect(performance.now() - started).toBeLessThan(3_000);
      expect(res.status).toBe(422);
      expect(res.body).toEqual({
        error: { code: 'invalid-guide', message: 'The guide has errors.', issues: [LIMIT_ISSUE] },
      });
      await (
        await next
      ).exited;
      expect(await countRows(ctx.db)).toEqual(before);
    });

    it('dry run: a parse over budget is 200 with one limit issue and no summary, writing nothing', async () => {
      const before = await countRows(ctx.db);
      const next = nextWorker();
      const started = performance.now();
      const res = await ann.agent.post('/api/runs?dryRun=true').attach('file', NESTED, 'slow.md');
      expect(performance.now() - started).toBeLessThan(3_000);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ issues: [LIMIT_ISSUE], summary: null });
      await (
        await next
      ).exited;
      expect(await countRows(ctx.db)).toEqual(before);
    });
  });

  describe('one parse per user', () => {
    let ctx: TestContext;
    let ann: SignedIn;
    let bob: SignedIn;
    beforeAll(async () => {
      ctx = await createTestContext({ parseTimeoutMs: 6_000 });
      ann = await ctx.signedInAgent('ann@example.com');
      bob = await ctx.signedInAgent('bob@example.com');
    });
    afterAll(async () => {
      await ctx.close();
    });

    it("refuses the same user's second upload with 429 while the first parses; others go ahead", async () => {
      const next = nextWorker();
      const first = ann.agent
        .post('/api/runs')
        .attach('file', SLOW, 'slow.md')
        .then((r) => r);
      await next; // Ann's slow parse is running.

      const second = await ann.agent
        .post('/api/runs?dryRun=true')
        .attach('file', TINY, 'tiny.yaml');
      expect(second.status).toBe(429);
      expect(second.body).toEqual({
        error: {
          code: 'rate-limited',
          message:
            'Another guide is still being checked. Only one of your guides can be checked at a time.',
        },
      });
      const other = await bob.agent.post('/api/runs').attach('file', TINY, 'tiny.yaml');
      expect(other.status).toBe(201);

      expect((await first).status).toBe(422); // over budget
      const again = await ann.agent.post('/api/runs').attach('file', TINY, 'tiny.yaml');
      expect(again.status).toBe(201);
    }, 30_000);
  });

  describe('client abort', () => {
    let ctx: TestContext;
    let ann: SignedIn;
    beforeAll(async () => {
      // A budget far longer than the test: only the abort can end the parse early.
      ctx = await createTestContext({ parseTimeoutMs: 60_000 });
      ann = await ctx.signedInAgent('ann@example.com');
    });
    afterAll(async () => {
      await ctx.close();
    });

    it('stops the parse and frees the slot when the client goes away', async () => {
      const next = nextWorker();
      const pending = ann.agent.post('/api/runs').attach('file', NESTED, 'slow.md');
      pending.then(
        () => undefined,
        () => undefined,
      );
      const { exited } = await next;
      const abortedAt = performance.now();
      pending.abort();
      await exited;
      expect(performance.now() - abortedAt).toBeLessThan(3_000);
      const again = await ann.agent.post('/api/runs').attach('file', TINY, 'tiny.yaml');
      expect(again.status).toBe(201);
    });
  });

  describe('a failing worker', () => {
    let ctx: TestContext;
    let ann: SignedIn;
    beforeAll(async () => {
      ctx = await createTestContext({ parseWorkerUrl: CRASH_WORKER_URL });
      ann = await ctx.signedInAgent('ann@example.com');
    });
    afterAll(async () => {
      await ctx.close();
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each([
      ['throws', CRASH_THROW],
      ['exits without replying', CRASH_EXIT],
    ])('a worker that %s is a logged 500, and the user can upload again', async (_, marker) => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const before = await countRows(ctx.db);
      const res = await ann.agent
        .post('/api/runs')
        .attach('file', Buffer.from(TINY_YAML + marker), 'tiny.yaml');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: { code: 'internal', message: 'Internal server error.' } });
      expect(errors).toHaveBeenCalledTimes(1);
      const logged = String(errors.mock.calls[0]?.[0]);
      expect(logged).toMatch(/guide parse worker/);
      expect(logged).not.toMatch(/crash-worker|Tiny guide|Test Game/);
      expect(await countRows(ctx.db)).toEqual(before);

      const again = await ann.agent.post('/api/runs').attach('file', TINY, 'tiny.yaml');
      expect(again.status).toBe(201);
    });
  });
});
