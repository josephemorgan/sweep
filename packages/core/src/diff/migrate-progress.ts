import type { RunProgress } from '../model/progress.js';
import { ProgressKind, type GuideDiff } from './diff-guides.js';
import { progressMoves } from './progress-moves.js';

/**
 * Moves stored progress across the renames in `diff`, returning a new `RunProgress`. It moves
 * exactly what `diff.progress.migrated` lists, which is authoritative. Only when `diff.progress`
 * is null does it derive the moves from the renamed lists; that fallback has no guides, so it
 * can't check whether a section is a leaf or a group. It never mutates `progress`.
 */
export function migrateProgress(progress: RunProgress, diff: GuideDiff): RunProgress {
  const moves =
    diff.progress?.migrated ?? progressMoves(diff.sections.renamed, diff.tasks.renamed, progress);
  const cleared = new Set(progress.cleared);
  const tasks = new Map(progress.tasks);
  let pin = progress.pin;
  for (const m of moves) {
    if (m.kind === ProgressKind.Cleared) cleared.delete(m.from);
    else if (m.kind === ProgressKind.Task) tasks.delete(m.from);
  }
  for (const m of moves) {
    if (m.kind === ProgressKind.Cleared) cleared.add(m.to);
    else if (m.kind === ProgressKind.Pin) pin = m.to;
    else if (m.kind === ProgressKind.Task) {
      const state = progress.tasks.get(m.from);
      if (state !== undefined) tasks.set(m.to, state);
    }
  }
  return { cleared, pin, tasks, tracked: new Map(progress.tracked) };
}
