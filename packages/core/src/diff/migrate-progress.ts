import type { RunProgress } from '../model/progress.js';
import type { GuideDiff } from './diff-guides.js';
import { progressMoves } from './progress-moves.js';

/**
 * Moves stored progress across the renames in `diff`, returning a new `RunProgress`. It moves
 * exactly what `diff.progress.migrated` lists (derived from the renamed lists, so it also works
 * when `diff.progress` is null). It never mutates `progress`.
 */
export function migrateProgress(progress: RunProgress, diff: GuideDiff): RunProgress {
  const moves = progressMoves(diff.sections.renamed, diff.tasks.renamed, progress);
  const cleared = new Set(progress.cleared);
  const tasks = new Map(progress.tasks);
  let pin = progress.pin;
  for (const m of moves) {
    if (m.kind === 'cleared') cleared.delete(m.from);
    else if (m.kind === 'task') tasks.delete(m.from);
  }
  for (const m of moves) {
    if (m.kind === 'cleared') cleared.add(m.to);
    else if (m.kind === 'pin') pin = m.to;
    else if (m.kind === 'task') tasks.set(m.to, progress.tasks.get(m.from)!);
  }
  return { cleared, pin, tasks, tracked: new Map(progress.tracked) };
}
