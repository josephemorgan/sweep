import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createDb, type Database } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';

export interface TestDb {
  db: Database;
  pool: pg.Pool;
  url: string;
  name: string;
  drop(): Promise<void>;
}

/** The DATABASE_URL server, pointed at the `postgres` maintenance DB. We never touch `sweep`. */
function maintenanceUrl(): URL {
  const raw = process.env['DATABASE_URL'];
  if (!raw) {
    throw new Error(
      'Server tests need DATABASE_URL: copy .env.example to .env and run `docker compose up -d postgres`.',
    );
  }
  const url = new URL(raw);
  url.pathname = '/postgres';
  return url;
}

async function runAdmin(statement: string): Promise<void> {
  const client = new pg.Client({ connectionString: maintenanceUrl().toString() });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

/**
 * One throwaway database per test file (beforeAll/afterAll). Leftovers from crashed runs:
 * `psql … -c "select datname from pg_database where datname like 'sweep_test_%'"`, then drop
 * only ones you know are yours (other worktrees share this Postgres).
 */
export async function createTestDb(): Promise<TestDb> {
  const name = `sweep_test_${randomBytes(6).toString('hex')}`;
  await runAdmin(`CREATE DATABASE ${name}`);
  const url = maintenanceUrl();
  url.pathname = `/${name}`;
  const { db, pool } = createDb(url.toString(), { max: 4 });
  await runMigrations(db);
  return {
    db,
    pool,
    url: url.toString(),
    name,
    async drop() {
      await pool.end();
      await runAdmin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    },
  };
}
