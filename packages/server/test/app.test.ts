import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JSON_BODY_LIMIT_BYTES } from '../src/limits.js';
import { createDb, type DbHandle } from '../src/db/client.js';
import { offlineApp } from './helpers/context.js';
import { createTestDb, type TestDb } from './helpers/test-db.js';

describe('GET /api/health', () => {
  let live: TestDb;
  let dead: DbHandle;

  beforeAll(async () => {
    live = await createTestDb();
    dead = createDb('postgres://sweep:sweep@127.0.0.1:1/sweep');
  });

  afterAll(async () => {
    await live.drop();
    await dead.pool.end();
  });

  it('returns 200 {ok: true, db: true} when Postgres answers', async () => {
    const res = await request(offlineApp(live.db)).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });

  it('returns 503 {ok: false, db: false} when Postgres is unreachable', async () => {
    const res = await request(offlineApp(dead.db)).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: false });
  });

  it('logs a described error, never the SQL, when the check fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await request(offlineApp(dead.db)).get('/api/health');
      expect(spy).toHaveBeenCalledTimes(1);
      const logged = spy.mock.calls[0]!.map(String).join(' ');
      expect(logged).toContain('health: database check failed');
      expect(logged).not.toContain('Failed query');
      expect(logged.toLowerCase()).not.toContain('select');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('API 404 and client serving', () => {
  const handle = createDb('postgres://sweep:sweep@127.0.0.1:1/sweep');
  const clientDir = mkdtempSync(join(tmpdir(), 'sweep-client-'));
  writeFileSync(join(clientDir, 'index.html'), '<!doctype html><app-root></app-root>');
  writeFileSync(join(clientDir, 'ngsw-worker.js'), '// worker');
  writeFileSync(join(clientDir, 'main.js'), '// main');
  writeFileSync(join(clientDir, 'ngsw.json'), '{}');
  writeFileSync(join(clientDir, 'main-ABCD2345.js'), '// main');
  writeFileSync(join(clientDir, 'chunk-ZXCV7654.js'), '// chunk');
  writeFileSync(join(clientDir, 'styles-QWER5678.css'), '/* css */');
  writeFileSync(join(clientDir, 'favicon.ico'), '');
  mkdirSync(join(clientDir, 'media'));
  writeFileSync(join(clientDir, 'media', 'font-ASDF2345.woff2'), '');
  const app = offlineApp(handle.db, { clientDistDir: clientDir });

  afterAll(async () => {
    await handle.pool.end();
    rmSync(clientDir, { recursive: true, force: true });
  });

  it('never answers /api routes with index.html', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.text).not.toContain('<app-root>');
  });

  it('falls back to index.html for client routes, uncached', async () => {
    const res = await request(app).get('/runs/abc');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<app-root>');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves / as index.html', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<app-root>');
  });

  it.each([
    '/main-ABCD2345.js',
    '/chunk-ZXCV7654.js',
    '/styles-QWER5678.css',
    '/media/font-ASDF2345.woff2',
  ])('serves fingerprinted %s as immutable for a year', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it.each(['/ngsw.json', '/ngsw-worker.js'])('serves %s with no-cache', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('does not mark un-fingerprinted files immutable', async () => {
    for (const path of ['/main.js', '/favicon.ico']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).not.toMatch(/immutable/);
    }
  });

  it('serves ngsw-worker.js with no-cache and other assets normally', async () => {
    const worker = await request(app).get('/ngsw-worker.js');
    expect(worker.status).toBe(200);
    expect(worker.headers['cache-control']).toBe('no-cache');
    const main = await request(app).get('/main.js');
    expect(main.status).toBe(200);
    expect(main.headers['cache-control']).not.toBe('no-cache');
  });

  it('does not serve the client when clientDistDir is unset', async () => {
    const res = await request(offlineApp(handle.db)).get('/');
    expect(res.status).toBe(404);
  });
});

describe('error handling', () => {
  const handle = createDb('postgres://sweep:sweep@127.0.0.1:1/sweep');

  afterAll(async () => {
    await handle.pool.end();
  });

  it('answers a malformed JSON body with a 400 and never logs the body', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const secret = 'SECRET-GUIDE-CONTENT';
      const res = await request(offlineApp(handle.db))
        .post('/api/anything')
        .set('Content-Type', 'application/json')
        .send(`{"guide": ${secret}}`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: { code: 'bad-request', message: expect.any(String) } });
      expect(res.text).not.toContain(secret);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('answers an oversized body with a 413 too-large', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await request(offlineApp(handle.db))
        .post('/api/anything')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ blob: 'x'.repeat(JSON_BODY_LIMIT_BYTES + 1) }));
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('too-large');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
