import type { RunProgress } from '../model/progress.js';
import type { ProgressMigration } from './diff-guides.js';
import { ProgressKind } from './progress-kind.js';

interface Rename {
  from: string;
  to: string;
}

/** Leaf IDs of the old and new guides, to tell which section progress is usable. */
export interface LeafSets {
  oldLeaves: ReadonlySet<string>;
  newLeaves: ReadonlySet<string>;
}

/**
 * The stored progress a rename update moves: sections first, then tasks, and within one section
 * rename the kinds `cleared`, `pin`, `task`. A move happens only when the old ID has progress and
 * the new ID has none (progress under the new ID wins, and the old entry stays as orphaned
 * progress). The pin is a single value, so it can't collide. `tracked` never moves (categories
 * aren't renamed in v1).
 *
 * With `leaves`, cleared and pin move only from a leaf of the old guide to a leaf of the new one
 * (progress on a group was never usable, and progress on a leaf that became a group can't be
 * used). Without it the leaf/group check is skipped, so callers that have no guides get a
 * best-effort answer.
 */
export function progressMoves(
  sectionRenames: readonly Rename[],
  taskRenames: readonly Rename[],
  progress: RunProgress,
  leaves?: LeafSets,
): ProgressMigration[] {
  const out: ProgressMigration[] = [];
  for (const { from, to } of sectionRenames) {
    if (leaves !== undefined && !(leaves.oldLeaves.has(from) && leaves.newLeaves.has(to))) continue;
    if (progress.cleared.has(from) && !progress.cleared.has(to)) {
      out.push({ kind: ProgressKind.Cleared, from, to });
    }
    if (progress.pin === from) out.push({ kind: ProgressKind.Pin, from, to });
  }
  for (const { from, to } of taskRenames) {
    if (progress.tasks.has(from) && !progress.tasks.has(to)) {
      out.push({ kind: ProgressKind.Task, from, to });
    }
  }
  return out;
}
