import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../src/db/client.js';
import { MIGRATIONS_DIR, runMigrations } from '../src/db/migrate.js';
import {
  categoryPrefs,
  guideVersions,
  runs,
  sectionProgress,
  taskProgress,
  user,
} from '../src/db/schema.js';
import { createTestDb, type TestDb } from './helpers/test-db.js';

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

describe('runMigrations on a fresh database', () => {
  let testDb: TestDb;
  beforeAll(async () => {
    testDb = await createTestDb();
  });
  afterAll(async () => {
    await testDb.drop();
  });

  it('creates the Better Auth and Sweep tables', async () => {
    const { rows } = await testDb.pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining([
        'user',
        'session',
        'account',
        'verification',
        'runs',
        'guide_versions',
        'section_progress',
        'task_progress',
        'category_prefs',
      ]),
    );
  });

  it('creates the container and task-state enums', async () => {
    const { rows } = await testDb.pool.query<{ typname: string; labels: string[] }>(
      `select t.typname, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
         from pg_type t join pg_enum e on e.enumtypid = t.oid
        where t.typname in ('guide_container', 'task_state')
        group by t.typname order by t.typname`,
    );
    expect(rows).toEqual([
      { typname: 'guide_container', labels: ['yaml', 'md'] },
      { typname: 'task_state', labels: ['done', 'dont-care'] },
    ]);
  });

  it('cascades a user delete to runs, guide versions and progress', async () => {
    const { db } = testDb;
    await db.insert(user).values({ id: 'u1', name: 'U', email: 'u1@example.com' });
    const [run] = await db
      .insert(runs)
      .values({ userId: 'u1', name: 'Run', currentVersion: 1 })
      .returning({ id: runs.id });
    const runId = run!.id;
    await db.insert(guideVersions).values({
      runId,
      version: 1,
      filename: 'g.yaml',
      container: 'yaml',
      source: 'x',
      sourceBytes: 1,
      sha256: 'abc',
      model: { formatVersion: 1, game: 'G', title: 'G', categories: [], sections: [], tasks: [] },
      modelVersion: 1,
      game: 'G',
      title: 'G',
    });
    await db.insert(sectionProgress).values({ runId, sectionId: 'a' });
    await db.insert(taskProgress).values({ runId, taskId: 't', state: 'done' });
    await db.insert(categoryPrefs).values({ runId, categoryId: 'c', tracked: false });

    await db.delete(user).where(eq(user.id, 'u1'));

    for (const table of [
      'runs',
      'guide_versions',
      'section_progress',
      'task_progress',
      'category_prefs',
    ]) {
      const { rows } = await testDb.pool.query<{ n: number }>(
        `select count(*)::int as n from ${table}`,
      );
      expect(rows[0]?.n, table).toBe(0);
    }
  });

  it('rejects an empty run name and a duplicate guide version', async () => {
    const { db } = testDb;
    await db.insert(user).values({ id: 'u2', name: 'U', email: 'u2@example.com' });
    await expect(
      db.insert(runs).values({ userId: 'u2', name: '', currentVersion: 1 }),
    ).rejects.toThrow();
    const [run] = await db
      .insert(runs)
      .values({ userId: 'u2', name: 'Run', currentVersion: 1 })
      .returning({ id: runs.id });
    const version = {
      runId: run!.id,
      version: 1,
      filename: 'g.yaml',
      container: 'yaml' as const,
      source: 'x',
      sourceBytes: 1,
      sha256: 'abc',
      model: {
        formatVersion: 1 as const,
        game: 'G',
        title: 'G',
        categories: [],
        sections: [],
        tasks: [],
      },
      modelVersion: 1,
      game: 'G',
      title: 'G',
    };
    await db.insert(guideVersions).values(version);
    await expect(db.insert(guideVersions).values(version)).rejects.toThrow();
  });

  it('is idempotent', async () => {
    await expect(runMigrations(testDb.db)).resolves.toBe('applied');
  });
});
