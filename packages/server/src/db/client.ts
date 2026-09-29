import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
}

export function createDb(databaseUrl: string): DbHandle {
  const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000 });
  pool.on('error', (err) => console.error('postgres pool error:', err.message));
  return { db: drizzle({ client: pool, schema }), pool };
}
