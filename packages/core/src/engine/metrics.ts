import type { Guide } from '../model/guide.js';
import type { RunProgress } from '../model/progress.js';
import type { RunView } from './cards.js';
import { clearImpactFrom, type ClosingTask } from './clear-impact.js';
import { indexGuide } from './structure.js';

export interface Metrics {
  here: number;
  now: number;
  closing: number;
  lastChance: number;
}

/** The tasks behind each bottom-bar metric (§4.9), task IDs in task file order. */
export interface MetricTasks {
  here: string[];
  now: string[];
  closing: ClosingTask[];
  lastChance: ClosingTask[];
}

/**
 * The bottom-bar metric lists (§4.9). `run` is the already derived state, reused as the "before"
 * side of CLOSING, so this costs one extra `deriveCore`. `category` absent or null means all
 * tracked categories; an untracked or unknown category gives empty lists.
 */
export function deriveMetricTasks(
  guide: Guide,
  progress: RunProgress,
  run: RunView,
  category?: string | null,
): MetricTasks {
  const tasks = indexGuide(guide).tasks;
  const counted = (taskId: string): boolean => {
    const cat = tasks.get(taskId)!.category;
    return run.tracked.has(cat) && (category == null || category === cat);
  };

  const here: string[] = [];
  const now: string[] = [];
  for (const [taskId, status] of run.tasks) {
    if (status.kind !== 'open' || !counted(taskId)) continue;
    now.push(taskId);
    if (
      run.current !== null &&
      run.windows
        .get(taskId)!
        .some((w, i) => w === 'open' && tasks.get(taskId)!.windows[i]!.home === run.current)
    ) {
      here.push(taskId);
    }
  }

  const closing =
    run.current === null
      ? []
      : clearImpactFrom(guide, progress, run, run.current).closing.filter((c) => counted(c.taskId));
  return { here, now, closing, lastChance: closing.filter((c) => c.nextChance === null) };
}

/** The bottom-bar metrics (§4.9): the sizes of `deriveMetricTasks`. */
export function deriveMetrics(
  guide: Guide,
  progress: RunProgress,
  run: RunView,
  category?: string | null,
): Metrics {
  const t = deriveMetricTasks(guide, progress, run, category);
  return {
    here: t.here.length,
    now: t.now.length,
    closing: t.closing.length,
    lastChance: t.lastChance.length,
  };
}
