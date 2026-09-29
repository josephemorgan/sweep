import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { JSON_BODY_LIMIT_BYTES } from '../src/limits.js';
import { createDb, type DbHandle } from '../src/db/client.js';

describe('GET /api/health', () => {
  let live: DbHandle;
  let dead: DbHandle;

  beforeAll(() => {
    const url = process.env['DATABASE_URL'];
    if (!url) {
      throw new Error(
        'Server tests need DATABASE_URL: copy .env.example to .env and run `docker compose up -d postgres`.',
      );
    }
    live = createDb(url);
    dead = createDb('postgres://sweep:sweep@127.0.0.1:1/sweep');
  });

  afterAll(async () => {
    await live.pool.end();
    await dead.pool.end();
  });

  it('returns 200 {ok: true, db: true} when Postgres answers', async () => {
    const res = await request(createApp({ db: live.db })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });

  it('returns 503 {ok: false, db: false} when Postgres is unreachable', async () => {
    const res = await request(createApp({ db: dead.db })).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, db: false });
  });
});

describe('API 404 and client serving', () => {
  const handle = createDb('postgres://sweep:sweep@127.0.0.1:1/sweep');
  const clientDir = mkdtempSync(join(tmpdir(), 'sweep-client-'));
  writeFileSync(join(clientDir, 'index.html'), '<!doctype html><app-root></app-root>');
  writeFileSync(join(clientDir, 'ngsw-worker.js'), '// worker');
  writeFileSync(join(clientDir, 'main.js'), '// main');
  const app = createApp({ db: handle.db, clientDistDir: clientDir });

  afterAll(async () => {
    await handle.pool.end();
  });

  it('answers unknown /api routes with a JSON 404, never index.html', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not-found', message: 'No such API route.' } });
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

  it('serves ngsw-worker.js with no-cache and other assets normally', async () => {
    const worker = await request(app).get('/ngsw-worker.js');
    expect(worker.status).toBe(200);
    expect(worker.headers['cache-control']).toBe('no-cache');
    const main = await request(app).get('/main.js');
    expect(main.status).toBe(200);
    expect(main.headers['cache-control']).not.toBe('no-cache');
  });

  it('does not serve the client when clientDistDir is unset', async () => {
    const res = await request(createApp({ db: handle.db })).get('/');
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
      const res = await request(createApp({ db: handle.db }))
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
      const res = await request(createApp({ db: handle.db }))
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
