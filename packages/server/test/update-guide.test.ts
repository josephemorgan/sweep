import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { guideVersions, runs } from '../src/db/schema.js';
import { parseUpload, requireValidGuide } from '../src/guides/core-adapter.js';
import { insertGuideVersion } from '../src/guides/store.js';
import { lockRun } from '../src/runs/progress-store.js';
import { createTestContext, type SignedIn, type TestContext } from './helpers/context.js';
import {
  deeplyNestedMd,
  TINY_GROUPED_YAML,
  TINY_INVALID_YAML,
  TINY_RENAMED_YAML,
  TINY_YAML,
} from './helpers/guides.js';
import { countRows, seedRun } from './helpers/seed.js';
import { uploadRun } from './helpers/uploads.js';
import { nextWorker } from './helpers/workers.js';

describe('update flow (spec §6.3)', () => {
  let ctx: TestContext;
  let ann: SignedIn;
  beforeAll(async () => {
    ctx = await createTestContext();
    ann = await ctx.signedInAgent('ann@example.com');
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.close();
  });

  /** v1 with progress under IDs that TINY_RENAMED_YAML renames. */
  async function runWithProgress(): Promise<string> {
    const runId = await uploadRun(ann.agent);
    const put = (path: string, body: object): Promise<unknown> =>
      ann.agent.put(`/api/runs/${runId}/${path}`).send(body).expect(204).then();
    await put('sections/village', { cleared: true });
    await put('sections/marsh', { cleared: true });
    await put('pin', { sectionId: 'keep' });
    await put('tasks/herbs', { state: 'done' });
    await put('tasks/chest', { state: 'dont-care' });
    await put('categories/lore', { tracked: true });
    return runId;
  }

  const post = (runId: string, source: string, baseVersion: string | null, dryRun: boolean) => {
    const req = ann.agent.post(`/api/runs/${runId}/guide${dryRun ? '?dryRun=true' : ''}`);
    if (baseVersion !== null) req.field('baseVersion', baseVersion);
    return req.attach('file', Buffer.from(source), 'next.yaml');
  };

  it('dry run returns the diff with progress effects and writes nothing', async () => {
    const runId = await runWithProgress();
    const [before] = await ctx.db.select().from(runs).where(eq(runs.id, runId));
    const counts = await countRows(ctx.db);
    const res = await post(runId, TINY_RENAMED_YAML, '1', true);
    expect(res.status).toBe(200);
    expect(res.body.issues).toEqual([]);
    expect(res.body.diff.sections.renamed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'marsh', to: 'swamp' }),
        expect.objectContaining({ from: 'keep', to: 'castle' }),
      ]),
    );
    expect(res.body.diff.progress.migrated).toEqual(
      expect.arrayContaining([
        { kind: 'cleared', from: 'marsh', to: 'swamp' },
        { kind: 'pin', from: 'keep', to: 'castle' },
        { kind: 'task', from: 'herbs', to: 'swamp-herbs' },
      ]),
    );
    expect(await countRows(ctx.db)).toEqual(counts);
    const [after] = await ctx.db.select().from(runs).where(eq(runs.id, runId));
    expect(after!.updatedAt.toISOString()).toBe(before!.updatedAt.toISOString());
  });

  it('dry run of an invalid guide returns issues and a null diff', async () => {
    const runId = await uploadRun(ann.agent);
    const res = await post(runId, TINY_INVALID_YAML, '1', true);
    expect(res.status).toBe(200);
    expect(res.body.diff).toBeNull();
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it('apply migrates cleared, task state and pin through renames and keeps category prefs', async () => {
    const runId = await runWithProgress();
    const res = await post(runId, TINY_RENAMED_YAML, '1', false);
    expect(res.status).toBe(200);
    expect(res.body.run.currentVersion).toBe(2);
    expect(res.body.guide.sections.map((s: { id: string }) => s.id)).toEqual(['act-1', 'castle']);
    expect(res.body.progress).toEqual({
      cleared: ['swamp', 'village'],
      pin: 'castle',
      tasks: { chest: 'dont-care', 'swamp-herbs': 'done' },
      tracked: { lore: true },
    });
    expect((await ann.agent.get(`/api/runs/${runId}`)).body).toEqual(res.body);
  });

  it('re-applying the same guide shows no renames on re-diff (spec §8 invariant)', async () => {
    const runId = await runWithProgress();
    await post(runId, TINY_RENAMED_YAML, '1', false).expect(200);
    const res = await post(runId, TINY_RENAMED_YAML, '2', true);
    expect(res.status).toBe(200);
    expect(res.body.diff.sections.renamed).toEqual([]);
    expect(res.body.diff.tasks.renamed).toEqual([]);
    expect(res.body.diff.progress.migrated).toEqual([]);
  });

  it('refuses a stale baseVersion with 409 on apply and on dry run', async () => {
    const runId = await uploadRun(ann.agent);
    await post(runId, TINY_RENAMED_YAML, '1', false).expect(200);
    const counts = await countRows(ctx.db);
    const stale = await post(runId, TINY_YAML, '1', false);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('stale-version');
    expect((await post(runId, TINY_YAML, '1', true)).status).toBe(409);
    expect(await countRows(ctx.db)).toEqual(counts);
  });

  it('refuses an invalid guide on apply with 422 and its issues', async () => {
    const runId = await uploadRun(ann.agent);
    const res = await post(runId, TINY_INVALID_YAML, '1', false);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('invalid-guide');
  });

  it.each([['abc'], ['1.0'], ['0'], ['-1'], [''], [' 1'], ['01'], ['1e0'], [null]])(
    'answers baseVersion %j with 400 (Review Focus 4)',
    async (baseVersion) => {
      const runId = await uploadRun(ann.agent);
      const counts = await countRows(ctx.db);
      for (const dryRun of [false, true]) {
        const res = await post(runId, TINY_YAML, baseVersion, dryRun);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('bad-request');
      }
      expect(await countRows(ctx.db)).toEqual(counts);
    },
  );

  it('keeps the pin when the pinned leaf becomes a group (Review Focus 3)', async () => {
    const runId = await uploadRun(ann.agent);
    await ann.agent.put(`/api/runs/${runId}/pin`).send({ sectionId: 'keep' }).expect(204);
    const dry = await post(runId, TINY_GROUPED_YAML, '1', true);
    expect(dry.body.diff.progress.orphaned).toEqual(
      expect.arrayContaining([{ kind: 'pin', id: 'keep' }]),
    );
    const res = await post(runId, TINY_GROUPED_YAML, '1', false);
    expect(res.status).toBe(200);
    expect(res.body.progress.pin).toBe('keep');
    expect((await ann.agent.get(`/api/runs/${runId}`)).status).toBe(200);
    expect((await ann.agent.put(`/api/runs/${runId}/pin`).send({ sectionId: 'keep' })).status).toBe(
      422,
    );
    await ann.agent.put(`/api/runs/${runId}/pin`).send({ sectionId: 'keep-gate' }).expect(204);
  });

  it('rolls everything back when apply fails mid-transaction', async () => {
    const runId = await runWithProgress();
    const counts = await countRows(ctx.db);
    // Fail the task rename (after the version insert and the section rename have run).
    await ctx.db.execute(
      sql.raw(`
        create function sweep_test_fail() returns trigger language plpgsql as
          $$ begin raise exception 'boom from trigger'; end $$;
        create trigger sweep_test_fail before update on task_progress
          for each row execute function sweep_test_fail();`),
    );
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await post(runId, TINY_RENAMED_YAML, '1', false);
      expect(res.status).toBe(500);
      const logged = spy.mock.calls.flat().join('\n');
      expect(logged).toContain('boom from trigger');
      expect(logged).not.toContain('Tiny guide');
      expect(logged).not.toContain('renamed_from');
    } finally {
      spy.mockRestore();
      await ctx.db.execute(
        sql.raw('drop trigger sweep_test_fail on task_progress; drop function sweep_test_fail();'),
      );
    }
    expect(await countRows(ctx.db)).toEqual(counts);
    const payload = (await ann.agent.get(`/api/runs/${runId}`)).body;
    expect(payload.run.currentVersion).toBe(1);
    expect(payload.progress).toEqual({
      cleared: ['marsh', 'village'],
      pin: 'keep',
      tasks: { chest: 'dont-care', herbs: 'done' },
      tracked: { lore: true },
    });
  });

  /** Resolves once exactly one session in this test database is waiting on a lock. */
  async function oneLockWaiter(): Promise<void> {
    await vi.waitFor(
      async () => {
        const result = await ctx.db.execute(
          sql`select count(*)::int as n from pg_stat_activity
              where datname = current_database() and wait_event_type = 'Lock'`,
        );
        expect((result.rows[0] as { n: number }).n).toBe(1);
      },
      { timeout: 5_000, interval: 20 },
    );
  }

  it('checks a progress write against the version current once it holds the run lock', async () => {
    const runId = await uploadRun(ann.agent);
    const next = await parseUpload({
      originalname: 'next.yaml',
      buffer: Buffer.from(TINY_RENAMED_YAML),
    });
    const guide = requireValidGuide(next.result);
    let put: Promise<{ status: number; body: { error?: { code: string } } }> | undefined;
    // Hold the run lock while a PUT for `marsh` (a leaf of v1 only) waits on it, then commit v2
    // as an apply would. The PUT must check the ID against v2, the version current at commit.
    await ctx.db.transaction(async (tx) => {
      await lockRun(tx, runId);
      put = ann.agent
        .put(`/api/runs/${runId}/sections/marsh`)
        .send({ cleared: true })
        .then((r) => r);
      await oneLockWaiter();
      await insertGuideVersion(tx, { runId, version: 2, upload: next, guide });
      await tx.update(runs).set({ currentVersion: 2 }).where(eq(runs.id, runId));
    });
    const res = await put!;
    expect(res.status).toBe(422);
    expect(res.body.error?.code).toBe('unknown-id');
    expect((await ann.agent.get(`/api/runs/${runId}`)).body.progress.cleared).toEqual([]);
  });
  it('refuses an apply whose baseVersion went stale while it waited for the run lock', async () => {
    const runId = await uploadRun(ann.agent);
    const next = await parseUpload({
      originalname: 'next.yaml',
      buffer: Buffer.from(TINY_RENAMED_YAML),
    });
    const guide = requireValidGuide(next.result);
    let apply: Promise<{ status: number; body: { error?: { code: string } } }> | undefined;
    // A second apply with the same baseVersion passes the route's pre-check, then waits on the
    // run lock while this transaction commits v2 as the first apply would. Under the lock it
    // must see v2 and refuse, never base v3 on a version the client didn't preview.
    await ctx.db.transaction(async (tx) => {
      await lockRun(tx, runId);
      apply = post(runId, TINY_GROUPED_YAML, '1', false).then((r) => r);
      await oneLockWaiter();
      await insertGuideVersion(tx, { runId, version: 2, upload: next, guide });
      await tx.update(runs).set({ currentVersion: 2 }).where(eq(runs.id, runId));
    });
    const res = await apply!;
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('stale-version');
    const [run] = await ctx.db.select().from(runs).where(eq(runs.id, runId));
    expect(run!.currentVersion).toBe(2);
    const versions = await ctx.db
      .select({ version: guideVersions.version })
      .from(guideVersions)
      .where(eq(guideVersions.runId, runId));
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
  }, 15_000);
});

describe('update flow: a parse over its time budget (spec §6.4)', () => {
  let ctx: TestContext;
  let ann: SignedIn;
  let runId: string;
  beforeAll(async () => {
    ctx = await createTestContext({ parseTimeoutMs: 200 });
    ann = await ctx.signedInAgent('ann@example.com');
    // Seeded, not uploaded: TINY_YAML must not race the 200 ms budget.
    runId = await seedRun(ctx.db, ann.userId);
  });
  afterAll(async () => {
    await ctx.close();
  });

  const NESTED = Buffer.from(deeplyNestedMd());
  const LIMIT_ISSUE = {
    severity: 'error',
    code: 'limit',
    message: 'the guide took too long to parse (over 0.2 s)',
    file: null,
    line: null,
    column: null,
    path: null,
  };

  async function postSlow(dryRun: boolean) {
    const before = await countRows(ctx.db);
    const [run] = await ctx.db.select().from(runs).where(eq(runs.id, runId));
    const worker = nextWorker();
    const res = await ann.agent
      .post(`/api/runs/${runId}/guide${dryRun ? '?dryRun=true' : ''}`)
      .field('baseVersion', '1')
      .attach('file', NESTED, 'slow.md');
    await (
      await worker
    ).exited;
    expect(await countRows(ctx.db)).toEqual(before);
    const [after] = await ctx.db.select().from(runs).where(eq(runs.id, runId));
    expect(after).toEqual(run);
    return res;
  }

  it('dry run: 200 with the single limit issue and a null diff, writing nothing', async () => {
    const res = await postSlow(true);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ issues: [LIMIT_ISSUE], diff: null });
  });

  it('apply: 422 invalid-guide with the single limit issue, writing nothing', async () => {
    const res = await postSlow(false);
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: { code: 'invalid-guide', message: 'The guide has errors.', issues: [LIMIT_ISSUE] },
    });
  });
});
