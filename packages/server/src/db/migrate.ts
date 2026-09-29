import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './client.js';

/** packages/server/drizzle, from src/db or dist/db. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** True once drizzle-kit has generated at least one migration (an empty journal does not count). */
function hasMigrations(dir: string): boolean {
  const journal = join(dir, 'meta', '_journal.json');
  if (!existsSync(journal)) return false;
  const { entries } = JSON.parse(readFileSync(journal, 'utf8')) as { entries?: unknown[] };
  return Array.isArray(entries) && entries.length > 0;
}

/** Applies pending migrations; a no-op until the first migration is generated. */
export async function runMigrations(
  db: Database,
  dir: string = MIGRATIONS_DIR,
): Promise<'applied' | 'none'> {
  if (!hasMigrations(dir)) return 'none';
  await migrate(db, { migrationsFolder: dir });
  return 'applied';
}
