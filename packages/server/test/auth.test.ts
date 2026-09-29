import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_PASSWORD, createTestContext, type TestContext } from './helpers/context.js';

function sessionCookie(res: { headers: Record<string, unknown> }): string {
  const cookies = (res.headers['set-cookie'] ?? []) as unknown as string[];
  return cookies.find((c) => c.includes('session_token')) ?? '';
}

describe('Better Auth over http', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
    await ctx.createUser('ann@example.com');
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('signs in and sets an httpOnly, SameSite=Lax session cookie (not Secure on http)', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/sign-in/email')
      .set('Origin', ctx.origin)
      .send({ email: 'ann@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/;\s*Secure/i);
  });

  it('rejects a wrong password', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/sign-in/email')
      .set('Origin', ctx.origin)
      .send({ email: 'ann@example.com', password: 'wrong-password-000' });
    expect(res.status).toBe(401);
  });

  it('rejects sign-in from an untrusted origin', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/sign-in/email')
      .set('Origin', 'http://evil.example')
      .send({ email: 'ann@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(403);
  });

  it('refuses sign-up while sign-up is disabled', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/sign-up/email')
      .set('Origin', ctx.origin)
      .send({ email: 'new@example.com', password: TEST_PASSWORD, name: 'New' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const { rows } = await ctx.testDb.pool.query<{ n: number }>(
      `select count(*)::int as n from "user" where email = 'new@example.com'`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('answers /api routes without a session with 401 unauthorized', async () => {
    const res = await request(ctx.app).get('/api/does-not-exist');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'unauthorized', message: expect.any(String) } });
  });

  it('lets a signed-in user through the guard (unknown routes are then a JSON 404)', async () => {
    const { agent } = await ctx.signedInAgent('bob@example.com');
    const res = await agent.get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not-found', message: 'No such API route.' } });
  });

  it('signs out', async () => {
    const { agent } = await ctx.signedInAgent('cat@example.com');
    expect((await agent.post('/api/auth/sign-out').send({})).status).toBe(200);
    expect((await agent.get('/api/does-not-exist')).status).toBe(401);
  });
});

describe('Better Auth over https', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext({ origin: 'https://sweep.example' });
    await ctx.createUser('dee@example.com');
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('marks the session cookie Secure when BETTER_AUTH_URL is https', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/sign-in/email')
      .set('Origin', 'https://sweep.example')
      .send({ email: 'dee@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });
});
