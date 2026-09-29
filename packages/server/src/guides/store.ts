import { MODEL_VERSION, type Guide } from '@sweep/core';
import { and, eq } from 'drizzle-orm';
import type { Executor } from '../db/client.js';
import { guideVersions, type RunRow } from '../db/schema.js';
import type { ParsedUpload } from './core-adapter.js';

export type RunRef = Pick<RunRow, 'id' | 'currentVersion'>;

export interface CurrentGuide {
  versionId: string;
  game: string;
  title: string;
  guide: Guide;
}

function currentVersionOf(run: RunRef) {
  return and(eq(guideVersions.runId, run.id), eq(guideVersions.version, run.currentVersion));
}

function missingVersion(run: RunRef): Error {
  return new Error(`run ${run.id} has no guide version ${run.currentVersion}`);
}

/** game/title of the current version, without loading the model. */
export async function loadVersionMeta(ex: Executor, run: RunRef): Promise<{ game: string; title: string }> {
  const [row] = await ex
    .select({ game: guideVersions.game, title: guideVersions.title })
    .from(guideVersions)
    .where(currentVersionOf(run));
  if (!row) throw missingVersion(run);
  return row;
}

export async function loadCurrentGuide(ex: Executor, run: RunRef): Promise<CurrentGuide> {
  const [row] = await ex
    .select({
      id: guideVersions.id,
      game: guideVersions.game,
      title: guideVersions.title,
      model: guideVersions.model,
    })
    .from(guideVersions)
    .where(currentVersionOf(run));
  if (!row) throw missingVersion(run);
  return { versionId: row.id, game: row.game, title: row.title, guide: row.model };
}

export interface NewGuideVersion {
  runId: string;
  version: number;
  upload: ParsedUpload;
  guide: Guide;
}

export async function insertGuideVersion(ex: Executor, v: NewGuideVersion): Promise<void> {
  await ex.insert(guideVersions).values({
    runId: v.runId,
    version: v.version,
    filename: v.upload.displayName,
    container: v.upload.container,
    source: v.upload.source,
    sourceBytes: v.upload.bytes,
    sha256: v.upload.sha256,
    model: v.guide,
    modelVersion: MODEL_VERSION,
    game: v.guide.game,
    title: v.guide.title,
  });
}
