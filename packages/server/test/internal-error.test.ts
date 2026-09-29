import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestContext, type SignedIn, type TestContext } from './helpers/context.js';
import { seedRun } from './helpers/seed.js';

describe('500 path through real routes', () => {
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

  it('logs a failed update without the request body or query params', async () => {
    const runId = await seedRun(ctx.db, ann.userId);
    await ctx.db.execute(
      sql.raw(`
        create function sweep_test_fail() returns trigger language plpgsql as
          $$ begin raise exception 'boom from trigger'; end $$;
        create trigger sweep_test_fail before update on runs
          for each row execute function sweep_test_fail();`),
    );
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await ann.agent.patch(`/api/runs/${runId}`).send({ name: 'SECRET-RUN-NAME' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'internal', message: 'Internal server error.' } });
    const logged = spy.mock.calls.flat().join('\n');
    expect(logged).toContain('boom from trigger');
    expect(logged).toContain('    at ');
    expect(logged).not.toContain('SECRET-RUN-NAME');
    spy.mockRestore();
  });

  it('answers a broken schema with 500 internal', async () => {
    await ctx.db.execute(sql.raw('alter table runs rename to runs_gone'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await ann.agent.get('/api/runs');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('internal');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
