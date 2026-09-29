import { createHash, randomUUID } from 'node:crypto';
import { MODEL_VERSION, type Guide } from '@sweep/core';
import { sql } from 'drizzle-orm';
import type { Database, Executor } from '../../src/db/client.js';
import { GuideContainer, guideVersions, runs, user } from '../../src/db/schema.js';
import { TINY_GUIDE, TINY_YAML } from './guides.js';

export async function seedUser(db: Database, email: string): Promise<string> {
  const id = randomUUID();
  await db.insert(user).values({ id, name: email.split('@')[0] ?? email, email });
  return id;
}

export interface SeedRunOptions {
  guide?: Guide;
  name?: string;
  source?: string;
  container?: GuideContainer;
}

/** Inserts a run and its version 1 directly (no parser needed). */
export async function seedRun(
  ex: Executor,
  userId: string,
  options: SeedRunOptions = {},
): Promise<string> {
  const guide = options.guide ?? TINY_GUIDE;
  const source = options.source ?? TINY_YAML;
  const [run] = await ex
    .insert(runs)
    .values({ userId, name: options.name ?? guide.title, currentVersion: 1 })
    .returning({ id: runs.id });
  if (!run) throw new Error('seedRun: insert returned no row');
  await ex.insert(guideVersions).values({
    runId: run.id,
    version: 1,
    filename: 'tiny.yaml',
    container: options.container ?? GuideContainer.Yaml,
    source,
    sourceBytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
    model: guide,
    modelVersion: MODEL_VERSION,
    game: guide.game,
    title: guide.title,
  });
  return run.id;
}

export const ALL_TABLES = [
  'user',
  'session',
  'account',
  'verification',
  'runs',
  'guide_versions',
  'section_progress',
  'task_progress',
  'category_prefs',
] as const;

/** Row counts of every table, for "writes nothing" assertions. */
export async function countRows(db: Database): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of ALL_TABLES) {
    const result = await db.execute(sql.raw(`select count(*)::int as n from "${table}"`));
    counts[table] = (result.rows[0] as { n: number }).n;
  }
  return counts;
}
