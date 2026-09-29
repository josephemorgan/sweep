import type { RunProgress } from '../model/progress.js';
import type { GuideDiff, ProgressMigration } from './diff-guides.js';
import { ProgressKind } from './progress-kind.js';
import { progressMoves } from './progress-moves.js';

/**
 * Moves stored progress across the renames in `diff`, returning a new `RunProgress`. It moves
 * what `diff.progress.migrated` lists, which is authoritative. Only when `diff.progress` is null
 * does it derive the moves from the renamed lists; that fallback has no guides, so it can't check
 * whether a section is a leaf or a group. The diff may have been computed from other progress, so
 * every move is re-checked against `progress`: the old entry must exist there, and progress
 * already under the new ID wins (the old entry stays, orphaned). It never mutates `progress`.
 */
export function migrateProgress(progress: RunProgress, diff: GuideDiff): RunProgress {
  const moves =
    diff.progress?.migrated ?? progressMoves(diff.sections.renamed, diff.tasks.renamed, progress);
  const cleared = new Set(progress.cleared);
  const tasks = new Map(progress.tasks);
  let pin = progress.pin;
  const applicable = moves.filter((m) => applies(progress, m));
  for (const m of applicable) {
    if (m.kind === ProgressKind.Cleared) cleared.delete(m.from);
    else if (m.kind === ProgressKind.Task) tasks.delete(m.from);
  }
  for (const m of applicable) {
    if (m.kind === ProgressKind.Cleared) cleared.add(m.to);
    else if (m.kind === ProgressKind.Pin) pin = m.to;
    else if (m.kind === ProgressKind.Task) {
      const state = progress.tasks.get(m.from);
      if (state !== undefined) tasks.set(m.to, state);
    }
  }
  return { cleared, pin, tasks, tracked: new Map(progress.tracked) };
}

function applies(progress: RunProgress, m: ProgressMigration): boolean {
  switch (m.kind) {
    case ProgressKind.Cleared:
      return progress.cleared.has(m.from) && !progress.cleared.has(m.to);
    case ProgressKind.Pin:
      return progress.pin === m.from;
    case ProgressKind.Task:
      return progress.tasks.has(m.from) && !progress.tasks.has(m.to);
    default:
      return false;
  }
}
