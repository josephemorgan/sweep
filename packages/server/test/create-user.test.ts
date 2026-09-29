import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DrizzleQueryError } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../src/auth.js';
import { CreateUserError, createUser, failureMessage } from '../src/scripts/create-user.js';
import {
  TEST_ORIGIN,
  TEST_PASSWORD,
  TEST_SECRET,
  createTestContext,
  type TestContext,
} from './helpers/context.js';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

describe('createUser', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const scriptAuth = (): ReturnType<typeof createAuth> =>
    createAuth({ db: ctx.db, secret: TEST_SECRET, baseURL: TEST_ORIGIN, signupEnabled: true });

  it('creates a user who can then sign in', async () => {
    const user = await createUser(scriptAuth(), {
      email: 'eve@example.com',
      name: 'Eve',
      password: TEST_PASSWORD,
    });
    expect(user.email).toBe('eve@example.com');
    const res = await request(ctx.app)
      .post('/api/auth/sign-in/email')
      .set('Origin', TEST_ORIGIN)
      .send({ email: 'eve@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });

  it('rejects a duplicate email', async () => {
    await createUser(scriptAuth(), {
      email: 'dup@example.com',
      name: 'D',
      password: TEST_PASSWORD,
    });
    await expect(
      createUser(scriptAuth(), { email: 'dup@example.com', name: 'D', password: TEST_PASSWORD }),
    ).rejects.toThrow(CreateUserError);
  });

  it('rejects a password under 12 characters', async () => {
    await expect(
      createUser(scriptAuth(), { email: 'short@example.com', name: 'S', password: 'elevenchars' }),
    ).rejects.toThrow(/at least 12/);
  });
});

describe('create-user CLI', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  function runCli(args: string[], input: string): SpawnSyncReturns<string> {
    return spawnSync(process.execPath, ['--import', 'tsx', 'src/scripts/create-user.ts', ...args], {
      cwd: SERVER_DIR,
      input,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        DATABASE_URL: ctx.testDb.url,
        BETTER_AUTH_SECRET: TEST_SECRET,
        BETTER_AUTH_URL: TEST_ORIGIN,
      },
    });
  }

  it('creates a user from a piped password and never prints it', async () => {
    const result = runCli(['--email', 'cli@example.com'], 'cli-password-123\n');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Created user cli@example\.com/);
    expect(result.stdout + result.stderr).not.toContain('cli-password-123');
    const res = await request(ctx.app)
      .post('/api/auth/sign-in/email')
      .set('Origin', TEST_ORIGIN)
      .send({ email: 'cli@example.com', password: 'cli-password-123' });
    expect(res.status).toBe(200);
  });

  it('defaults --name to the email local part', async () => {
    expect(runCli(['--email', 'named@example.com'], 'cli-password-123\n').status).toBe(0);
    const { rows } = await ctx.testDb.pool.query<{ name: string }>(
      `select name from "user" where email = 'named@example.com'`,
    );
    expect(rows[0]?.name).toBe('named');
  });

  it('exits 1 with a clear message on a duplicate email', () => {
    expect(runCli(['--email', 'twice@example.com'], 'cli-password-123\n').status).toBe(0);
    const again = runCli(['--email', 'twice@example.com'], 'cli-password-123\n');
    expect(again.status).toBe(1);
    expect(again.stderr).toMatch(/already exists/);
    expect(again.stdout + again.stderr).not.toContain('cli-password-123');
  });

  it('exits 1 on a short password', () => {
    const result = runCli(['--email', 'tiny@example.com'], 'short\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/at least 12/);
  });

  it('exits 1 with usage when --email is missing or invalid', () => {
    expect(runCli([], 'cli-password-123\n').stderr).toMatch(/Usage/);
    expect(runCli(['--email', 'not-an-email'], 'cli-password-123\n').status).toBe(1);
  });
});

describe('failureMessage', () => {
  it('prints safe messages as they are', () => {
    expect(failureMessage(new CreateUserError('Passwords do not match.'))).toBe(
      'Passwords do not match.',
    );
    const parseError = (() => {
      try {
        parseArgs({ args: ['--nope'], options: {}, strict: true });
      } catch (err) {
        return err;
      }
      return undefined;
    })();
    expect(failureMessage(parseError)).toMatch(/^Unknown option '--nope'/);
  });

  it("never prints a failed query's SQL or params", () => {
    const err = new DrizzleQueryError(
      'insert into "user" ("email") values ($1)',
      ['leak@example.com', '$scrypt$hash'],
      new Error('connection terminated'),
    );
    const printed = failureMessage(err);
    expect(printed).toContain('connection terminated');
    expect(printed).not.toMatch(/leak@example\.com|\$scrypt\$hash|insert into/);
  });
});
