import { describe, expect, it } from 'vitest';
import { readEnv } from '../src/env.js';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

describe('readEnv', () => {
  it('applies defaults: PORT 3000, sign-up off', () => {
    expect(readEnv(base)).toEqual({
      databaseUrl: base.DATABASE_URL,
      port: 3000,
      signupEnabled: false,
      betterAuthSecret: undefined,
      betterAuthUrl: undefined,
      clientDistDir: undefined,
    });
  });

  it('reads every variable', () => {
    const env = readEnv({
      ...base,
      PORT: '8080',
      SIGNUP_ENABLED: 'true',
      BETTER_AUTH_SECRET: 's',
      BETTER_AUTH_URL: 'http://x',
      CLIENT_DIST_DIR: '/app/public',
    });
    expect(env.port).toBe(8080);
    expect(env.signupEnabled).toBe(true);
    expect(env.betterAuthSecret).toBe('s');
    expect(env.betterAuthUrl).toBe('http://x');
    expect(env.clientDistDir).toBe('/app/public');
  });

  it('requires DATABASE_URL', () => {
    expect(() => readEnv({})).toThrow(/DATABASE_URL/);
  });

  it.each(['0', '70000', 'abc', ''])('rejects PORT=%j', (port) => {
    expect(() => readEnv({ ...base, PORT: port })).toThrow(/PORT/);
  });

  it('rejects SIGNUP_ENABLED values other than true/false', () => {
    expect(() => readEnv({ ...base, SIGNUP_ENABLED: 'yes' })).toThrow(/SIGNUP_ENABLED/);
  });
});
