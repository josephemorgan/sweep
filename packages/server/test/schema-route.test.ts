import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client.js';
import { offlineApp } from './helpers/context.js';

const COMMITTED = JSON.parse(
  readFileSync(new URL('../../../schema/sweep-guide.v1.schema.json', import.meta.url), 'utf8'),
) as unknown;

describe('GET /schema/sweep-guide.v1.schema.json', () => {
  const handle = createDb('postgres://sweep:sweep@127.0.0.1:1/sweep');
  afterAll(async () => {
    await handle.pool.end();
  });

  it('serves the guide JSON Schema publicly, uncached', async () => {
    const res = await request(offlineApp(handle.db)).get('/schema/sweep-guide.v1.schema.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body).toEqual(COMMITTED);
  });

  it('wins over the SPA fallback when the client is served', async () => {
    const clientDir = mkdtempSync(join(tmpdir(), 'sweep-client-'));
    try {
      writeFileSync(join(clientDir, 'index.html'), '<app-root></app-root>');
      const res = await request(offlineApp(handle.db, { clientDistDir: clientDir })).get(
        '/schema/sweep-guide.v1.schema.json',
      );
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.text).not.toContain('<app-root>');
    } finally {
      rmSync(clientDir, { recursive: true, force: true });
    }
  });
});
