import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;
/** The database or a transaction on it: helpers that run inside or outside a transaction take this. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
}

export interface DbOptions {
  /** Pool size. Tests keep it small: every test file opens its own pool on a shared Postgres. */
  max?: number;
}

export function createDb(databaseUrl: string, options: DbOptions = {}): DbHandle {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000,
    ...(options.max === undefined ? {} : { max: options.max }),
  });
  pool.on('error', (err) => console.error('postgres pool error:', err.message));
  return { db: drizzle({ client: pool, schema }), pool };
}
