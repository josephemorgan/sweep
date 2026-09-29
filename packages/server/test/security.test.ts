import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RATE_LIMITS } from '../src/limits.js';
import { createTestContext, type TestContext } from './helpers/context.js';

describe('security headers', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('sends the strict CSP from spec §6.4', async () => {
    const res = await request(ctx.app).get('/api/health');
    const csp = String(res.headers['content-security-policy']);
    expect(csp.split(';').map((d) => d.trim())).toEqual([
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]);
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('sends helmet defaults and hides Express', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('same-origin guard', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('refuses a state-changing /api request without an Origin header', async () => {
    const res = await request(ctx.app).post('/api/runs').send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'bad-origin', message: expect.any(String) } });
  });

  it('refuses a foreign Origin', async () => {
    const res = await request(ctx.app)
      .put('/api/runs/x/pin')
      .set('Origin', 'http://evil.example')
      .send({ sectionId: null });
    expect(res.status).toBe(403);
  });

  it('lets GET through without an Origin', async () => {
    expect((await request(ctx.app).get('/api/health')).status).toBe(200);
  });

  it('lets same-origin writes reach the session guard', async () => {
    const res = await request(ctx.app).post('/api/runs').set('Origin', ctx.origin).send({});
    expect(res.status).toBe(401);
  });
});

describe('auth rate limit', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext({ rateLimits: { auth: { limit: 3, windowMs: 60_000 } } });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('limits sign-in attempts per IP and sends draft-8 headers', async () => {
    const attempt = (): ReturnType<ReturnType<typeof request>['post']> =>
      request(ctx.app)
        .post('/api/auth/sign-in/email')
        .set('Origin', ctx.origin)
        .send({ email: 'nobody@example.com', password: 'wrong-password-000' });
    for (let i = 0; i < 3; i += 1) {
      const res = await attempt();
      expect(res.status).toBe(401);
      expect(res.headers['ratelimit-policy']).toMatch(/"auth";\s*q=3;\s*w=60/);
      expect(res.headers['ratelimit']).toMatch(/"auth";\s*r=\d+;\s*t=\d+/);
    }
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: { code: 'rate-limited', message: expect.any(String) } });
  });

  it('never limits GET get-session', async () => {
    for (let i = 0; i < 6; i += 1) {
      expect((await request(ctx.app).get('/api/auth/get-session')).status).toBe(200);
    }
  });
});

describe('API rate limit', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext({ rateLimits: { api: { limit: 2, windowMs: 60_000 } } });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('limits each signed-in user separately', async () => {
    const ann = await ctx.signedInAgent('ann@example.com');
    const bob = await ctx.signedInAgent('bob@example.com');
    for (let i = 0; i < 2; i += 1) {
      const res = await ann.agent.get('/api/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.headers['ratelimit-policy']).toMatch(/"api";\s*q=2;\s*w=60/);
    }
    const limited = await ann.agent.get('/api/does-not-exist');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('rate-limited');
    expect((await bob.agent.get('/api/does-not-exist')).status).toBe(404);
  });
});

describe('trust proxy', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext({
      trustProxy: 1,
      rateLimits: { auth: { limit: 1, windowMs: 60_000 } },
    });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('keys the auth limiter on the forwarded client IP', async () => {
    const attempt = (ip: string): ReturnType<ReturnType<typeof request>['post']> =>
      request(ctx.app)
        .post('/api/auth/sign-in/email')
        .set('Origin', ctx.origin)
        .set('X-Forwarded-For', ip)
        .send({ email: 'nobody@example.com', password: 'wrong-password-000' });
    expect((await attempt('203.0.113.1')).status).toBe(401);
    expect((await attempt('203.0.113.1')).status).toBe(429);
    expect((await attempt('203.0.113.2')).status).toBe(401);
  });
});

describe('RATE_LIMITS', () => {
  it('matches spec §6.4', () => {
    expect(RATE_LIMITS).toEqual({
      auth: { limit: 10, windowMs: 60_000 },
      uploads: { limit: 30, windowMs: 3_600_000 },
      api: { limit: 600, windowMs: 60_000 },
    });
  });
});
