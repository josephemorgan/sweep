import type { RunProgress } from '../model/progress.js';
import type { ProgressMigration } from './diff-guides.js';

interface Rename {
  from: string;
  to: string;
}

/**
 * The stored progress a rename update moves: sections first, then tasks, and within one section
 * rename the kinds `cleared`, `pin`, `task`. A move happens only when the old ID has progress and
 * the new ID has none (progress under the new ID wins, and the old entry stays as orphaned
 * progress). The pin is a single value, so it can't collide. `tracked` never moves (categories
 * aren't renamed in v1).
 */
export function progressMoves(
  sectionRenames: readonly Rename[],
  taskRenames: readonly Rename[],
  progress: RunProgress,
): ProgressMigration[] {
  const out: ProgressMigration[] = [];
  for (const { from, to } of sectionRenames) {
    if (progress.cleared.has(from) && !progress.cleared.has(to)) {
      out.push({ kind: 'cleared', from, to });
    }
    if (progress.pin === from) out.push({ kind: 'pin', from, to });
  }
  for (const { from, to } of taskRenames) {
    if (progress.tasks.has(from) && !progress.tasks.has(to)) {
      out.push({ kind: 'task', from, to });
    }
  }
  return out;
}
