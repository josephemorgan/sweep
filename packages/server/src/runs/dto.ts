import { progressToDto, type RunDto, type RunPayloadDto } from '@sweep/core';
import type { Executor } from '../db/client.js';
import type { RunRow } from '../db/schema.js';
import { loadCurrentGuide } from '../guides/store.js';
import { readProgress } from './progress-store.js';

export function toRunDto(run: RunRow, meta: { game: string; title: string }): RunDto {
  return {
    id: run.id,
    name: run.name,
    game: meta.game,
    title: meta.title,
    currentVersion: run.currentVersion,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

/** `{run, guide, progress}`: the single payload the client engine runs on (spec §6.2). */
export async function buildPayload(ex: Executor, run: RunRow): Promise<RunPayloadDto> {
  const current = await loadCurrentGuide(ex, run);
  const progress = await readProgress(ex, run.id);
  return { run: toRunDto(run, current), guide: current.guide, progress: progressToDto(progress) };
}
