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
      demoEnabled: false,
      betterAuthSecret: SECRET,
      betterAuthUrl: 'http://localhost:4200',
      clientDistDir: undefined,
      trustProxy: false,
      parseTimeoutMs: 5_000,
    });
  });

  it('reads every variable and reduces BETTER_AUTH_URL to its origin', () => {
    const env = readEnv({
      ...base,
      PORT: '8080',
      SIGNUP_ENABLED: 'true',
      DEMO_ENABLED: 'true',
      BETTER_AUTH_URL: 'https://sweep.example.com/some/path?x=1',
      CLIENT_DIST_DIR: '/app/public',
      TRUST_PROXY: '2',
      PARSE_TIMEOUT_MS: '2500',
    });
    expect(env.port).toBe(8080);
    expect(env.signupEnabled).toBe(true);
    expect(env.demoEnabled).toBe(true);
    expect(env.betterAuthUrl).toBe('https://sweep.example.com');
    expect(env.clientDistDir).toBe('/app/public');
    expect(env.trustProxy).toBe(2);
    expect(env.parseTimeoutMs).toBe(2_500);
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

  it.each(['https://user:secret@', 'ftp://user:secret@host.example'])(
    'keeps credentials in BETTER_AUTH_URL=%s out of the error',
    (value) => {
      let message = '';
      try {
        readEnv({ ...base, BETTER_AUTH_URL: value });
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toMatch(/BETTER_AUTH_URL/);
      expect(message).not.toContain('user');
      expect(message).not.toContain('secret');
    },
  );

  describe('in production (spec §6.4: cookies are always Secure)', () => {
    const production = (url: string) =>
      readEnv({ ...base, NODE_ENV: 'production', BETTER_AUTH_URL: url });

    it('accepts an https origin', () => {
      expect(production('https://sweep.example').betterAuthUrl).toBe('https://sweep.example');
    });

    it.each([
      ['http://localhost:3000', 'http://localhost:3000'],
      ['http://127.0.0.1:3000', 'http://127.0.0.1:3000'],
      ['http://[::1]:3000', 'http://[::1]:3000'],
      ['http://LOCALHOST', 'http://localhost'],
    ])('accepts the http loopback origin %s', (url, origin) => {
      expect(production(url).betterAuthUrl).toBe(origin);
    });

    it.each([
      'http://sweep.example',
      'http://localhost.evil.com',
      'http://127.0.0.1.evil.com',
      'http://10.0.0.5:3000',
    ])('refuses the http origin %s, naming the variable and scheme only', (url) => {
      const withSecret = url.replace('http://', 'http://user:hunter2@');
      let message = '';
      try {
        production(withSecret);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toMatch(/BETTER_AUTH_URL/);
      expect(message).toMatch(/https/);
      expect(message).toContain('"http"');
      expect(message).not.toContain('hunter2');
      expect(message).not.toContain(new URL(url).hostname);
    });

    it('allows any http origin outside production', () => {
      expect(readEnv({ ...base, BETTER_AUTH_URL: 'http://sweep.example' }).betterAuthUrl).toBe(
        'http://sweep.example',
      );
      const dev = { ...base, NODE_ENV: 'development', BETTER_AUTH_URL: 'http://sweep.example' };
      expect(readEnv(dev).betterAuthUrl).toBe('http://sweep.example');
    });
  });

  it('treats an empty TRUST_PROXY as unset', () => {
    expect(readEnv({ ...base, TRUST_PROXY: '' }).trustProxy).toBe(false);
  });

  it.each(['-1', 'abc', '1.5', 'true', '11'])('rejects TRUST_PROXY=%j', (value) => {
    expect(() => readEnv({ ...base, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
  });

  it.each(['0', '-5', '1.5', 'abc', '5s', '60001'])('rejects PARSE_TIMEOUT_MS=%j', (value) => {
    expect(() => readEnv({ ...base, PARSE_TIMEOUT_MS: value })).toThrow(/PARSE_TIMEOUT_MS/);
  });

  it('treats an empty PARSE_TIMEOUT_MS as unset', () => {
    expect(readEnv({ ...base, PARSE_TIMEOUT_MS: '' }).parseTimeoutMs).toBe(5_000);
  });

  it.each(['0', '70000', 'abc', ''])('rejects PORT=%j', (port) => {
    expect(() => readEnv({ ...base, PORT: port })).toThrow(/PORT/);
  });

  it('rejects SIGNUP_ENABLED values other than true/false', () => {
    expect(() => readEnv({ ...base, SIGNUP_ENABLED: 'yes' })).toThrow(/SIGNUP_ENABLED/);
  });

  it('rejects DEMO_ENABLED values other than true/false', () => {
    expect(() => readEnv({ ...base, DEMO_ENABLED: 'yes' })).toThrow(/DEMO_ENABLED/);
  });
});
