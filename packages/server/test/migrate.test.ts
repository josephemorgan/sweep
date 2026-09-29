import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client.js';
import { MIGRATIONS_DIR, runMigrations } from '../src/db/migrate.js';

describe('runMigrations', () => {
  const handle = createDb('postgres://sweep:sweep@127.0.0.1:1/sweep');
  afterAll(async () => {
    await handle.pool.end();
  });

  it('defaults to packages/server/drizzle', () => {
    expect(MIGRATIONS_DIR.endsWith(join('packages', 'server', 'drizzle'))).toBe(true);
    expect(MIGRATIONS_DIR.endsWith(sep)).toBe(false);
  });

  it('is a no-op (no DB access) when no migrations exist yet', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'sweep-migrations-'));
    await expect(runMigrations(handle.db, empty)).resolves.toBe('none');
  });

  it('is also a no-op when drizzle-kit left an empty journal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sweep-migrations-'));
    mkdirSync(join(dir, 'meta'));
    writeFileSync(
      join(dir, 'meta', '_journal.json'),
      JSON.stringify({ version: '7', dialect: 'postgresql', entries: [] }),
    );
    await expect(runMigrations(handle.db, dir)).resolves.toBe('none');
  });
});
