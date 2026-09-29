import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUOTAS } from '../src/limits.js';
import { createTestContext, type SignedIn, type TestContext } from './helpers/context.js';
import { TINY_RENAMED_YAML, TINY_YAML } from './helpers/guides.js';
import { seedRun } from './helpers/seed.js';
import { uploadRun } from './helpers/uploads.js';

const TINY_BYTES = Buffer.byteLength(TINY_YAML);

describe('upload rate limit', () => {
  let ctx: TestContext;
  let ann: SignedIn;
  beforeAll(async () => {
    ctx = await createTestContext({ rateLimits: { uploads: { limit: 2, windowMs: 3_600_000 } } });
    ann = await ctx.signedInAgent('ann@example.com');
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('shares one per-user budget across both upload routes', async () => {
    const runId = await seedRun(ctx.db, ann.userId);
    const create = await ann.agent
      .post('/api/runs?dryRun=true')
      .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(create.status).toBe(200);
    expect(create.headers['ratelimit-policy']).toMatch(/"uploads";\s*q=2;\s*w=3600/);
    const update = await ann.agent
      .post(`/api/runs/${runId}/guide?dryRun=true`)
      .field('baseVersion', '1')
      .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(update.status).toBe(200);
    const limited = await ann.agent
      .post('/api/runs?dryRun=true')
      .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('rate-limited');
    // Non-upload API calls have their own budget.
    expect((await ann.agent.get('/api/runs')).status).toBe(200);
  });
});

describe('upload rate limit of one', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext({ rateLimits: { uploads: { limit: 1, windowMs: 3_600_000 } } });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('refuses a second upload on either route; a rejected query costs no upload', async () => {
    const { agent } = await ctx.signedInAgent('ann@example.com');
    const badQuery = await agent
      .post('/api/runs?dryRun=yes')
      .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(badQuery.status).toBe(400);
    const runId = await uploadRun(agent);
    const second = await agent
      .post('/api/runs')
      .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('rate-limited');
    const update = await agent
      .post(`/api/runs/${runId}/guide`)
      .field('baseVersion', '1')
      .attach('file', Buffer.from(TINY_RENAMED_YAML), 'next.yaml');
    expect(update.status).toBe(429);
  });
});

describe('multipart limits', () => {
  let ctx: TestContext;
  let ann: SignedIn;
  let runId: string;
  beforeAll(async () => {
    ctx = await createTestContext();
    ann = await ctx.signedInAgent('ann@example.com');
    runId = await seedRun(ctx.db, ann.userId);
  });
  afterAll(async () => {
    await ctx.close();
  });

  const malformedUpload = (res: {
    status: number;
    body: { error: { code: string; message: string } };
  }) => {
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad-request');
    // Refused by multer while reading the body, not later by field validation.
    expect(res.body.error.message).toMatch(/^Malformed upload/);
  };

  it('answers too many fields with 400', async () => {
    let req = ann.agent.post('/api/runs?dryRun=true');
    for (let i = 0; i < 6; i += 1) req = req.field(`f${i}`, 'x');
    malformedUpload(await req.attach('file', Buffer.from(TINY_YAML), 'tiny.yaml'));
  });

  it('answers a field value over 1 KiB with 400', async () => {
    malformedUpload(
      await ann.agent
        .post('/api/runs?dryRun=true')
        .field('name', 'x'.repeat(1025))
        .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml'),
    );
    malformedUpload(
      await ann.agent
        .post(`/api/runs/${runId}/guide?dryRun=true`)
        .field('baseVersion', '1'.repeat(1025))
        .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml'),
    );
  });

  it('answers a field name over 32 bytes with 400', async () => {
    malformedUpload(
      await ann.agent
        .post('/api/runs?dryRun=true')
        .field('n'.repeat(33), 'x')
        .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml'),
    );
  });

  it('checks the query before reading the upload, on both routes', async () => {
    // The file is in the wrong field: reading the body would fail with "Malformed upload".
    const create = await ann.agent
      .post('/api/runs?bogus=1')
      .attach('guide', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(create.status).toBe(400);
    expect(create.body.error.message).toMatch(/^Malformed request/);
    const update = await ann.agent
      .post(`/api/runs/${runId}/guide?dryRun=yes`)
      .field('baseVersion', '1')
      .attach('guide', Buffer.from(TINY_YAML), 'tiny.yaml');
    expect(update.status).toBe(400);
    expect(update.body.error.message).toMatch(/^Malformed request/);
  });
});

describe('quotas over HTTP (spec §6.5)', () => {
  it('runs per user → 409 quota-runs; dry runs are unaffected', async () => {
    const ctx = await createTestContext({ quotas: { runsPerUser: 1 } });
    try {
      const { agent } = await ctx.signedInAgent('ann@example.com');
      await uploadRun(agent);
      const res = await agent.post('/api/runs').attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('quota-runs');
      const dry = await agent
        .post('/api/runs?dryRun=true')
        .attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
      expect(dry.status).toBe(200);
    } finally {
      await ctx.close();
    }
  });

  it('versions per run → 409 quota-versions', async () => {
    const ctx = await createTestContext({ quotas: { versionsPerRun: 1 } });
    try {
      const { agent } = await ctx.signedInAgent('ann@example.com');
      const runId = await uploadRun(agent);
      const res = await agent
        .post(`/api/runs/${runId}/guide`)
        .field('baseVersion', '1')
        .attach('file', Buffer.from(TINY_RENAMED_YAML), 'next.yaml');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('quota-versions');
    } finally {
      await ctx.close();
    }
  });

  it('stored source bytes per user → 409 quota-storage', async () => {
    const ctx = await createTestContext({
      quotas: { ...QUOTAS, sourceBytesPerUser: Math.floor(TINY_BYTES * 1.5) },
    });
    try {
      const { agent } = await ctx.signedInAgent('ann@example.com');
      await uploadRun(agent);
      const res = await agent.post('/api/runs').attach('file', Buffer.from(TINY_YAML), 'tiny.yaml');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('quota-storage');
    } finally {
      await ctx.close();
    }
  });
});
