import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createTestDb } from './helpers/test-db.js';

async function databaseExists(name: string): Promise<boolean> {
  const url = new URL(process.env['DATABASE_URL'] ?? '');
  url.pathname = '/postgres';
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('select 1 from pg_database where datname = $1', [name]);
    return rowCount === 1;
  } finally {
    await client.end();
  }
}

describe('createTestDb', () => {
  it('creates a migrated sweep_test_* database and drops it', async () => {
    const testDb = await createTestDb();
    expect(testDb.name).toMatch(/^sweep_test_[0-9a-f]{12}$/);
    expect(new URL(testDb.url).pathname).toBe(`/${testDb.name}`);
    expect(await databaseExists(testDb.name)).toBe(true);
    await testDb.drop();
    expect(await databaseExists(testDb.name)).toBe(false);
  });
});
