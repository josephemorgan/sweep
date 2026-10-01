import { DEMO_USER_EMAIL } from '@sweep/core';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  categoryPrefs,
  GuideContainer,
  guideVersions,
  runs,
  sectionProgress,
  session,
  taskProgress,
  user,
} from '../src/db/schema.js';
import type { DemoTemplate } from '../src/demo/types.js';
import { demoPassword, demoSignIn, ensureDemoUser } from '../src/demo/user.js';
import {
  createTestContext,
  TEST_ORIGIN,
  TEST_RATE_LIMITS,
  TEST_SECRET,
  type SignedIn,
  type TestContext,
} from './helpers/context.js';
import { TINY_GUIDE, TINY_RENAMED_YAML, TINY_YAML } from './helpers/guides.js';
import { seedRun } from './helpers/seed.js';
import { uploadRun } from './helpers/uploads.js';

const TEMPLATE: DemoTemplate = {
  name: 'Sample run',
  version: {
    version: 1,
    filename: 'tiny.yaml',
    container: GuideContainer.Yaml,
    source: TINY_YAML,
    bytes: Buffer.byteLength(TINY_YAML),
    sha256: 'abc',
    guide: TINY_GUIDE,
  },
  progress: {
    cleared: new Set(['village']),
    pin: 'marsh',
    tasks: new Map([['chest', 'done']]),
    tracked: new Map(),
  },
  createdAgoMs: 86_400_000,
  playedAgoMs: 3_600_000,
};

describe('demo mode', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext({ demo: { templates: [TEMPLATE], secret: TEST_SECRET } });
  });
  afterAll(async () => {
    await ctx.close();
  });

  async function firstRunId(guest: SignedIn): Promise<string> {
    const list = await guest.agent.get('/api/runs').expect(200);
    return (list.body as Array<{ id: string }>)[0]!.id;
  }

  /** Rows the demo user owns in runs, guide_versions and the three progress tables. */
  async function demoTableRows(demoUserId: string): Promise<number> {
    const owned = eq(runs.userId, demoUserId);
    const counts = await Promise.all([
      ctx.db.select().from(runs).where(owned),
      ctx.db
        .select()
        .from(guideVersions)
        .innerJoin(runs, eq(runs.id, guideVersions.runId))
        .where(owned),
      ctx.db
        .select()
        .from(sectionProgress)
        .innerJoin(runs, eq(runs.id, sectionProgress.runId))
        .where(owned),
      ctx.db
        .select()
        .from(taskProgress)
        .innerJoin(runs, eq(runs.id, taskProgress.runId))
        .where(owned),
      ctx.db
        .select()
        .from(categoryPrefs)
        .innerJoin(runs, eq(runs.id, categoryPrefs.runId))
        .where(owned),
    ]);
    return counts.reduce((sum, rows) => sum + rows.length, 0);
  }

  it('reports the demo status publicly', async () => {
    await request(ctx.app).get('/api/demo').expect(200, { enabled: true });
  });

  it('is off without the option: status false and sign-in is 404', async () => {
    const off = await createTestContext();
    try {
      await request(off.app).get('/api/demo').expect(200, { enabled: false });
      const res = await request(off.app)
        .post('/api/demo/sign-in')
        .set('Origin', off.origin)
        .expect(404);
      expect(res.body.error).toMatchObject({
        code: 'not-found',
        message: 'The demo is not enabled.',
      });
      await request(off.app).get('/api/demo/other').expect(401);
    } finally {
      await off.close();
    }
  });

  it('signs a guest in as the demo user with a session cookie', async () => {
    const guest = await ctx.demoAgent();
    const session = await guest.agent.get('/api/auth/get-session').expect(200);
    expect(session.body.user).toMatchObject({ id: guest.userId, email: DEMO_USER_EMAIL });
  });

  it('serves the seeded run with stats and the full payload', async () => {
    const guest = await ctx.demoAgent();
    const list = await guest.agent.get('/api/runs').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      name: 'Sample run',
      game: 'Test Game',
      title: 'Tiny guide',
      currentVersion: 1,
      leavesCleared: 1,
    });
    const id = list.body[0].id as string;
    const payload = await guest.agent.get(`/api/runs/${id}`).expect(200);
    expect(payload.body.run.id).toBe(id);
    expect(payload.body.guide.title).toBe('Tiny guide');
    expect(payload.body.progress).toMatchObject({ cleared: ['village'], pin: 'marsh' });
  });

  it('round-trips every write and never touches the database', async () => {
    const guest = await ctx.demoAgent();
    const id = await firstRunId(guest);
    const put = (path: string, body: object) =>
      guest.agent.put(`/api/runs/${id}/${path}`).send(body).expect(204);
    await put('sections/marsh', { cleared: true });
    await put('pin', { sectionId: 'keep' });
    await put('tasks/herbs', { state: 'dont-care' });
    await put('categories/lore', { tracked: true });
    const renamed = await guest.agent
      .patch(`/api/runs/${id}`)
      .send({ name: '  Mine  ' })
      .expect(200);
    expect(renamed.body.name).toBe('Mine');
    const payload = await guest.agent.get(`/api/runs/${id}`).expect(200);
    expect(payload.body.run.name).toBe('Mine');
    expect(payload.body.progress.cleared.sort()).toEqual(['marsh', 'village']);
    expect(payload.body.progress.pin).toBe('keep');
    expect(payload.body.progress.tasks).toMatchObject({ chest: 'done', herbs: 'dont-care' });
    expect(payload.body.progress.tracked).toMatchObject({ lore: true });
    await guest.agent.delete(`/api/runs/${id}`).expect(204);
    await guest.agent.get(`/api/runs/${id}`).expect(404);
    expect(await demoTableRows(guest.userId)).toBe(0);
  });

  it('keeps each session in its own sandbox', async () => {
    const one = await ctx.demoAgent();
    const two = await ctx.demoAgent();
    const a = await firstRunId(one);
    const b = await firstRunId(two);
    expect(a).not.toBe(b);
    await one.agent.put(`/api/runs/${a}/sections/marsh`).send({ cleared: true }).expect(204);
    await one.agent.patch(`/api/runs/${a}`).send({ name: 'Changed' }).expect(200);
    const other = await two.agent.get(`/api/runs/${b}`).expect(200);
    expect(other.body.progress.cleared).toEqual(['village']);
    expect(other.body.run.name).toBe('Sample run');
    await two.agent.get(`/api/runs/${a}`).expect(404);
  });

  it('keeps real users on the database router, separate from the demo', async () => {
    const ann = await ctx.signedInAgent('ann@example.com');
    const annRun = await seedRun(ctx.db, ann.userId);
    const guest = await ctx.demoAgent();
    const list = await ann.agent.get('/api/runs').expect(200);
    expect(list.body.map((r: { id: string }) => r.id)).toEqual([annRun]);
    await guest.agent.get(`/api/runs/${annRun}`).expect(404);
    const demoRun = await firstRunId(guest);
    await ann.agent.get(`/api/runs/${demoRun}`).expect(404);
    await ann.agent.put(`/api/runs/${annRun}/sections/village`).send({ cleared: true }).expect(204);
    expect(await ctx.db.select().from(sectionProgress)).toHaveLength(1);
  });

  it('rejects unknown ids with 422 and malformed run ids with 404', async () => {
    const guest = await ctx.demoAgent();
    const id = await firstRunId(guest);
    const cases: Array<[string, object]> = [
      ['sections/act-1', { cleared: true }],
      ['sections/nope', { cleared: true }],
      ['pin', { sectionId: 'act-1' }],
      ['tasks/chest-2', { state: 'done' }],
      ['categories/nope', { tracked: true }],
    ];
    for (const [path, body] of cases) {
      const res = await guest.agent.put(`/api/runs/${id}/${path}`).send(body).expect(422);
      expect(res.body.error.code).toBe('unknown-id');
    }
    const res = await guest.agent
      .put(`/api/runs/${id}/tasks/nope`)
      .send({ state: null })
      .expect(422);
    expect(res.body.error.message).toBe(`"nope" is not a task in this run's current guide.`);
    await guest.agent.put(`/api/runs/${id}/pin`).send({ sectionId: 'Bad Id' }).expect(400);
    await guest.agent.get('/api/runs/not-a-uuid').expect(404);
  });

  it('creates a run from an upload in the sandbox only', async () => {
    const guest = await ctx.demoAgent();
    const dry = await guest.agent
      .post('/api/runs?dryRun=true')
      .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml')
      .expect(200);
    expect(dry.body.issues).toEqual([]);
    expect(dry.body.summary).not.toBeNull();
    const runId = await uploadRun(guest.agent);
    const list = await guest.agent.get('/api/runs').expect(200);
    expect(list.body.map((r: { id: string }) => r.id)).toContain(runId);
    expect(list.body).toHaveLength(2);
    expect(await demoTableRows(guest.userId)).toBe(0);
  });

  it('previews, applies and rejects stale guide updates', async () => {
    const guest = await ctx.demoAgent();
    const id = await firstRunId(guest);
    const post = (base: string, dryRun: boolean) =>
      guest.agent
        .post(`/api/runs/${id}/guide${dryRun ? '?dryRun=true' : ''}`)
        .field('baseVersion', base)
        .attach('file', Buffer.from(TINY_RENAMED_YAML), 'next.yaml');
    const dry = await post('1', true).expect(200);
    expect(dry.body.issues).toEqual([]);
    expect(dry.body.diff.sections.renamed).toEqual(
      expect.arrayContaining([expect.objectContaining({ from: 'marsh', to: 'swamp' })]),
    );
    const applied = await post('1', false).expect(200);
    expect(applied.body.run.currentVersion).toBe(2);
    expect(applied.body.guide.sections.some((s: { id: string }) => s.id === 'castle')).toBe(true);
    expect(applied.body.progress.pin).toBe('swamp');
    const stale = await post('1', false).expect(409);
    expect(stale.body.error.code).toBe('stale-version');
    await post('1', true).expect(409);
    expect(await demoTableRows(guest.userId)).toBe(0);
  });

  it('derives a deterministic password', () => {
    expect(demoPassword('a'.repeat(32))).toBe(demoPassword('a'.repeat(32)));
    expect(demoPassword('a'.repeat(32))).not.toBe(demoPassword('b'.repeat(32)));
    expect(demoPassword('a'.repeat(32))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('ensureDemoUser', () => {
  it('recreates the account when its password no longer matches the secret', async () => {
    const ctx = await createTestContext();
    try {
      const oldId = await ctx.createUser(DEMO_USER_EMAIL);
      const options = {
        db: ctx.db,
        auth: ctx.auth,
        signupAuth: ctx.scriptAuth,
        secret: TEST_SECRET,
      };
      await expect(demoSignIn(ctx.auth, TEST_SECRET)).rejects.toThrow();
      const { id } = await ensureDemoUser(options);
      expect(id).not.toBe(oldId);
      const signedIn = await demoSignIn(ctx.auth, TEST_SECRET);
      expect(signedIn.user).toMatchObject({ id, email: DEMO_USER_EMAIL });
      expect(signedIn.headers.getSetCookie().length).toBeGreaterThan(0);
      // A matching account is left alone.
      expect((await ensureDemoUser(options)).id).toBe(id);
      expect(await ctx.db.select().from(user).where(eq(user.email, DEMO_USER_EMAIL))).toHaveLength(
        1,
      );
    } finally {
      await ctx.close();
    }
  });

  it('leaves no demo session rows behind', async () => {
    const ctx = await createTestContext();
    try {
      const options = {
        db: ctx.db,
        auth: ctx.auth,
        signupAuth: ctx.scriptAuth,
        secret: TEST_SECRET,
      };
      const sessionCount = async (id: string): Promise<number> =>
        (await ctx.db.select().from(session).where(eq(session.userId, id))).length;
      const { id } = await ensureDemoUser(options);
      expect(await sessionCount(id)).toBe(0);
      await demoSignIn(ctx.auth, TEST_SECRET);
      await demoSignIn(ctx.auth, TEST_SECRET);
      expect(await sessionCount(id)).toBe(2);
      expect((await ensureDemoUser(options)).id).toBe(id);
      expect(await sessionCount(id)).toBe(0);
    } finally {
      await ctx.close();
    }
  });
});

describe('demo auth guard and demo off', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext({ demo: { templates: [TEMPLATE], secret: TEST_SECRET } });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('limits the demo account to get-session and sign-out', async () => {
    const guest = await ctx.demoAgent();
    await guest.agent.get('/api/auth/list-sessions').expect(404);
    await guest.agent.post('/api/auth/revoke-sessions').send({}).expect(404);
    await guest.agent.get('/api/auth/get-session').expect(200);
    await guest.agent.post('/api/auth/sign-out').send({}).expect(200);
  });

  it('leaves Better Auth untouched for real users', async () => {
    const { agent } = await ctx.signedInAgent('real@example.com');
    await agent.get('/api/auth/list-sessions').expect(200);
  });

  it('rejects a leftover demo session when the demo is off', async () => {
    const signIn = await request(ctx.app).post('/api/demo/sign-in').set('Origin', ctx.origin);
    expect(signIn.status).toBe(200);
    const cookie = (signIn.headers['set-cookie'] as unknown as string[]).map(
      (c) => c.split(';')[0]!,
    );
    const offApp = createApp({
      db: ctx.db,
      auth: ctx.auth,
      sameOrigin: TEST_ORIGIN,
      rateLimits: TEST_RATE_LIMITS,
    });
    await request(offApp).get('/api/runs').set('Cookie', cookie).expect(401);
    const status = await request(offApp).get('/api/demo').expect(200);
    expect(status.body).toEqual({ enabled: false });
  });
});
