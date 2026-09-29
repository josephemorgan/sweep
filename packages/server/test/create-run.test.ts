import { createHash } from 'node:crypto';
import { MODEL_VERSION } from '@sweep/core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guideVersions, runs } from '../src/db/schema.js';
import { LIMITS, parseUpload, requireValidGuide } from '../src/guides/core-adapter.js';
import { QUOTAS } from '../src/limits.js';
import { createRun, defaultRunName } from '../src/runs/create-run.js';
import { createTestContext, type SignedIn, type TestContext } from './helpers/context.js';
import {
  TINY_GUIDE,
  TINY_INVALID_YAML,
  TINY_MD,
  TINY_WARNING_YAML,
  TINY_YAML,
} from './helpers/guides.js';
import { countRows } from './helpers/seed.js';
import { uploadRun } from './helpers/uploads.js';

describe('create flow (spec §6.3)', () => {
  let ctx: TestContext;
  let ann: SignedIn;
  beforeAll(async () => {
    ctx = await createTestContext();
    ann = await ctx.signedInAgent('ann@example.com');
  });
  afterAll(async () => {
    await ctx.close();
  });

  const versionRow = async (runId: string) =>
    (await ctx.db.select().from(guideVersions).where(eq(guideVersions.runId, runId)))[0]!;

  it('dry run returns issues and a summary and writes nothing', async () => {
    const before = await countRows(ctx.db);
    const res = await ann.agent
      .post('/api/runs?dryRun=true')
      .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      issues: [],
      summary: {
        game: 'Test Game',
        title: 'Tiny guide',
        sections: 4,
        leaves: 3,
        tasks: 3,
        categories: 2,
      },
    });
    expect(await countRows(ctx.db)).toEqual(before);
  });

  it('dry run of an invalid guide returns its issues, a null summary, and writes nothing', async () => {
    const before = await countRows(ctx.db);
    const res = await ann.agent
      .post('/api/runs?dryRun=true')
      .attach('file', Buffer.from(TINY_INVALID_YAML), 'bad.yaml');
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeNull();
    expect(res.body.issues.some((i: { severity: string }) => i.severity === 'error')).toBe(true);
    expect(await countRows(ctx.db)).toEqual(before);
  });

  it('creates a run and version 1', async () => {
    const res = await ann.agent
      .post('/api/runs')
      .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(res.status).toBe(201);
    const { runId } = res.body as { runId: string };
    const payload = (await ann.agent.get(`/api/runs/${runId}`)).body;
    expect(payload.run).toMatchObject({
      name: 'Tiny guide',
      game: 'Test Game',
      title: 'Tiny guide',
      currentVersion: 1,
    });
    expect(payload.guide).toEqual(TINY_GUIDE);
    expect(await versionRow(runId)).toMatchObject({
      version: 1,
      filename: 'tiny.yaml',
      container: 'yaml',
      source: TINY_YAML,
      sourceBytes: Buffer.byteLength(TINY_YAML),
      sha256: createHash('sha256').update(TINY_YAML).digest('hex'),
      modelVersion: MODEL_VERSION,
      game: 'Test Game',
      title: 'Tiny guide',
    });
  });

  it('uses a trimmed name field when given', async () => {
    const res = await ann.agent
      .post('/api/runs')
      .field('name', '  Hard mode  ')
      .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(res.status).toBe(201);
    expect((await ann.agent.get(`/api/runs/${res.body.runId}`)).body.run.name).toBe('Hard mode');
  });

  it.each(['', '   ', 'x'.repeat(101), 'tab\there'])('rejects name %j with 400', async (name) => {
    const res = await ann.agent
      .post('/api/runs')
      .field('name', name)
      .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(res.status).toBe(400);
  });

  it('refuses an invalid guide with 422 and its issues, writing nothing', async () => {
    const before = await countRows(ctx.db);
    const res = await ann.agent
      .post('/api/runs')
      .attach('file', Buffer.from(TINY_INVALID_YAML), 'bad.yaml');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('invalid-guide');
    expect(res.body.error.issues.length).toBeGreaterThan(0);
    expect(await countRows(ctx.db)).toEqual(before);
  });

  it.each([
    ['invalid UTF-8', Buffer.concat([Buffer.from(TINY_YAML), Buffer.from([0xc3, 0x28])])],
    ['a NUL byte in a comment', Buffer.from(`${TINY_YAML}# NUL \u0000\n`)],
    ['a NUL escape', Buffer.from(TINY_YAML.replace('Start here.', '"Start \\0 here."'))],
    ['a lone surrogate escape', Buffer.from(TINY_YAML.replace('Start here.', '"\\ud800"'))],
  ])('refuses %s with 422 invalid-guide (encoding), never a 500', async (_, bytes) => {
    const before = await countRows(ctx.db);
    const res = await ann.agent.post('/api/runs').attach('file', bytes, 'tiny.yaml');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('invalid-guide');
    expect(res.body.error.issues.map((i: { code: string }) => i.code)).toEqual(['encoding']);
    expect(await countRows(ctx.db)).toEqual(before);
  });

  it('accepts a guide with warnings only', async () => {
    const dry = await ann.agent
      .post('/api/runs?dryRun=true')
      .attach('file', Buffer.from(TINY_WARNING_YAML), 'warn.yaml');
    expect(dry.body.issues.map((i: { code: string }) => i.code)).toContain('unused-category');
    expect(dry.body.summary).not.toBeNull();
    const res = await ann.agent
      .post('/api/runs')
      .attach('file', Buffer.from(TINY_WARNING_YAML), 'warn.yaml');
    expect(res.status).toBe(201);
  });

  it('stores the Markdown container', async () => {
    const runId = await uploadRun(ann.agent, TINY_MD, 'tiny.md');
    expect((await versionRow(runId)).container).toBe('md');
  });

  it('keeps a non-ASCII file name intact (Review Focus 1)', async () => {
    const runId = await uploadRun(ann.agent, TINY_YAML, 'ガイド 🗺.yaml');
    expect((await versionRow(runId)).filename).toBe('ガイド 🗺.yaml');
  });

  it('strips a path from the file name and accepts it by its extension (Review Focus 1)', async () => {
    const runId = await uploadRun(ann.agent, TINY_MD, 'C:\\games\\ガイド.MD');
    expect(await versionRow(runId)).toMatchObject({ filename: 'ガイド.MD', container: 'md' });
  });

  it('ignores the declared content type', async () => {
    const res = await ann.agent
      .post('/api/runs')
      .attach('file', Buffer.from(TINY_YAML), { filename: 'tiny.yaml', contentType: 'image/png' });
    expect(res.status).toBe(201);
  });

  it('answers a file over 2 MiB with 413 too-large', async () => {
    const res = await ann.agent
      .post('/api/runs?dryRun=true')
      .attach('file', Buffer.alloc(LIMITS.fileBytes + 1, 0x61), 'big.yaml');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('too-large');
  });

  it('answers an unsupported extension with 422 bad-extension', async () => {
    const res = await ann.agent
      .post('/api/runs?dryRun=true')
      .attach('file', Buffer.from(TINY_YAML), 'tiny.txt');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('bad-extension');
  });

  it('answers a wrong field name, a second file, or no file with 400', async () => {
    const wrongField = await ann.agent
      .post('/api/runs')
      .attach('guide', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(wrongField.status).toBe(400);
    const twoFiles = await ann.agent
      .post('/api/runs')
      .attach('file', Buffer.from(TINY_YAML), 'a.yaml')
      .attach('file', Buffer.from(TINY_YAML), 'b.yaml');
    expect(twoFiles.status).toBe(400);
    const noFile = await ann.agent.post('/api/runs').send({});
    expect(noFile.status).toBe(400);
  });

  it('answers unknown query keys or an unknown field with 400', async () => {
    const badQuery = await ann.agent
      .post('/api/runs?dryRun=yes')
      .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(badQuery.status).toBe(400);
    const badField = await ann.agent
      .post('/api/runs')
      .field('colour', 'red')
      .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(badField.status).toBe(400);
  });
});

describe('create flow quotas', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext({ quotas: { runsPerUser: 1 } });
  });
  afterAll(async () => {
    await ctx.close();
  });

  // Over HTTP, one parse per user (spec §6.4) turns most same-user racers away with 429 before
  // they reach the database, so the quota lock itself is raced here, below the route.
  it('lets only one of several concurrent createRun calls past a one-run quota', async () => {
    const userId = await ctx.createUser('bea@example.com');
    const upload = await parseUpload({ originalname: 'tiny.yaml', buffer: Buffer.from(TINY_YAML) });
    const input = {
      userId,
      upload,
      guide: requireValidGuide(upload.result),
      name: undefined,
      quotas: { ...QUOTAS, runsPerUser: 1 },
    };
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => createRun(ctx.db, input)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((r) => r.status === 'rejected')) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({
        status: 409,
        code: 'quota-runs',
      });
    }
    expect(await ctx.db.select().from(runs).where(eq(runs.userId, userId))).toHaveLength(1);
  });

  it('creates exactly one run from concurrent uploads by one user (the rest are 409 or 429)', async () => {
    const { agent, userId } = await ctx.signedInAgent('cid@example.com');
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        agent.post('/api/runs').attach('file', Buffer.from(TINY_YAML), 'tiny.yaml'),
      ),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s !== 201).every((s) => s === 409 || s === 429)).toBe(true);
    expect(await ctx.db.select().from(runs).where(eq(runs.userId, userId))).toHaveLength(1);
  });
});

describe('defaultRunName', () => {
  const named = (title: string, game = 'Test Game') =>
    defaultRunName({ ...TINY_GUIDE, title, game });

  it.each([
    ['  Tiny guide  ', 'Test Game', 'Tiny guide'],
    ['   ', 'Test Game', 'Test Game'],
    ['', ' ', 'Untitled run'],
    ['Line\none\ttab', 'Test Game', 'Line one tab'],
    ['🗺'.repeat(150), 'Test Game', '🗺'.repeat(100)],
  ])('title %j, game %j → %j', (title, game, expected) => {
    expect(named(title, game)).toBe(expected);
  });
});
