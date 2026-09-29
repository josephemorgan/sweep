import { describe, expect, it } from 'vitest';
import { readEnv } from '../src/env.js';

const SECRET = 'x'.repeat(32);
const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: 'http://localhost:4200',
};

describe('readEnv', () => {
  it('applies defaults: PORT 3000, sign-up off, no proxy trust', () => {
    expect(readEnv(base)).toEqual({
      databaseUrl: base.DATABASE_URL,
      port: 3000,
      signupEnabled: false,
      betterAuthSecret: SECRET,
      betterAuthUrl: 'http://localhost:4200',
      clientDistDir: undefined,
      trustProxy: false,
    });
  });

  it('reads every variable and reduces BETTER_AUTH_URL to its origin', () => {
    const env = readEnv({
      ...base,
      PORT: '8080',
      SIGNUP_ENABLED: 'true',
      BETTER_AUTH_URL: 'https://sweep.example.com/some/path?x=1',
      CLIENT_DIST_DIR: '/app/public',
      TRUST_PROXY: '2',
    });
    expect(env.port).toBe(8080);
    expect(env.signupEnabled).toBe(true);
    expect(env.betterAuthUrl).toBe('https://sweep.example.com');
    expect(env.clientDistDir).toBe('/app/public');
    expect(env.trustProxy).toBe(2);
  });

  it('requires DATABASE_URL', () => {
    expect(() => readEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('requires a BETTER_AUTH_SECRET of at least 32 characters and never echoes it', () => {
    expect(() => readEnv({ ...base, BETTER_AUTH_SECRET: undefined })).toThrow(/BETTER_AUTH_SECRET/);
    const short = 'short-secret-value';
    let message = '';
    try {
      readEnv({ ...base, BETTER_AUTH_SECRET: short });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/at least 32/);
    expect(message).not.toContain(short);
  });

  it.each([undefined, '', 'not a url', 'ftp://x.example', 'localhost:4200'])(
    'rejects BETTER_AUTH_URL=%j',
    (value) => {
      expect(() => readEnv({ ...base, BETTER_AUTH_URL: value })).toThrow(/BETTER_AUTH_URL/);
    },
  );

  it('treats an empty TRUST_PROXY as unset', () => {
    expect(readEnv({ ...base, TRUST_PROXY: '' }).trustProxy).toBe(false);
  });

  it.each(['-1', 'abc', '1.5', 'true', '11'])('rejects TRUST_PROXY=%j', (value) => {
    expect(() => readEnv({ ...base, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
  });

  it.each(['0', '70000', 'abc', ''])('rejects PORT=%j', (port) => {
    expect(() => readEnv({ ...base, PORT: port })).toThrow(/PORT/);
  });

  it('rejects SIGNUP_ENABLED values other than true/false', () => {
    expect(() => readEnv({ ...base, SIGNUP_ENABLED: 'yes' })).toThrow(/SIGNUP_ENABLED/);
  });
});
