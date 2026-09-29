import type { Guide } from '../model/guide.js';
import type { RunProgress } from '../model/progress.js';
import type { RunView } from './cards.js';
import { clearImpactFrom } from './clear-impact.js';
import { indexGuide } from './structure.js';

export interface Metrics {
  here: number;
  now: number;
  closing: number;
  lastChance: number;
}

/**
 * The bottom-bar metrics (§4.9). `run` is the already derived state, reused as the "before" side
 * of CLOSING, so this costs one extra `deriveCore`. `category` absent or null means all tracked
 * categories; an untracked or unknown category gives zeros.
 */
export function deriveMetrics(
  guide: Guide,
  progress: RunProgress,
  run: RunView,
  category?: string | null,
): Metrics {
  const tasks = indexGuide(guide).tasks;
  const counted = (taskId: string): boolean => {
    const cat = tasks.get(taskId)!.category;
    return run.tracked.has(cat) && (category == null || category === cat);
  };

  let here = 0;
  let now = 0;
  for (const [taskId, status] of run.tasks) {
    if (status.kind !== 'open' || !counted(taskId)) continue;
    now += 1;
    if (
      run.current !== null &&
      run.windows
        .get(taskId)!
        .some((w, i) => w === 'open' && tasks.get(taskId)!.windows[i]!.home === run.current)
    ) {
      here += 1;
    }
  }

  let closing = 0;
  let lastChance = 0;
  if (run.current !== null) {
    for (const c of clearImpactFrom(guide, progress, run, run.current).closing) {
      if (!counted(c.taskId)) continue;
      closing += 1;
      if (c.nextChance === null) lastChance += 1;
    }
  }
  return { here, now, closing, lastChance };
}
