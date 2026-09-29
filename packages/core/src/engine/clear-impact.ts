import type { Guide } from '../model/guide.js';
import { setCleared, type RunProgress } from '../model/progress.js';
import { deriveCore, type CoreView } from './derive.js';
import { indexGuide, isLeaf } from './structure.js';

export interface ClosingTask {
  taskId: string;
  nextChance: string | null;
}
export interface ClearImpact {
  closing: ClosingTask[];
  lastChance: ClosingTask[];
  unlocks: string[];
  wasLocked: boolean;
}

/** What clearing `leafId` would do (§4.10). Covers all categories; callers filter. */
export function clearImpact(guide: Guide, progress: RunProgress, leafId: string): ClearImpact {
  return clearImpactFrom(guide, progress, deriveCore(guide, progress), leafId);
}

/** As `clearImpact`, reusing an already derived "before" state. */
export function clearImpactFrom(
  guide: Guide,
  progress: RunProgress,
  before: CoreView,
  leafId: string,
): ClearImpact {
  const index = indexGuide(guide);
  const section = index.sections.get(leafId);
  if (section === undefined || !isLeaf(section) || before.sections.get(leafId)?.cleared === true) {
    return { closing: [], lastChance: [], unlocks: [], wasLocked: false };
  }

  const after = deriveCore(guide, setCleared(progress, leafId, true));

  const closing: ClosingTask[] = [];
  for (const task of guide.tasks) {
    const was = before.tasks.get(task.id)!.kind;
    const now = after.tasks.get(task.id)!;
    if ((was === 'open' || was === 'upcoming') && now.kind === 'missed') {
      closing.push({ taskId: task.id, nextChance: now.nextChance });
    }
  }

  const unlocks: string[] = [];
  for (const leaf of index.leaves) {
    if (!before.sections.get(leaf.id)!.unlocked && after.sections.get(leaf.id)!.unlocked) {
      unlocks.push(leaf.id);
    }
  }

  return {
    closing,
    lastChance: closing.filter((c) => c.nextChance === null),
    unlocks,
    wasLocked: !before.sections.get(leafId)!.unlocked,
  };
}
