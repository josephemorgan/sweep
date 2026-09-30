import type { GuideIndex, MetricTasks, RunView } from '@sweep/core';

export const Metric = {
  Here: 'here',
  Now: 'now',
  Closing: 'closing',
  LastChance: 'lastChance',
} as const;
export type Metric = (typeof Metric)[keyof typeof Metric];

export const METRIC_LABEL: Record<Metric, string> = {
  here: 'Here',
  now: 'Now',
  closing: 'Closing',
  lastChance: 'Last chance',
};

export function metricTaskIds(tasks: MetricTasks, metric: Metric): string[] {
  switch (metric) {
    case 'here':
      return tasks.here;
    case 'now':
      return tasks.now;
    case 'closing':
      return tasks.closing.map((c) => c.taskId);
    case 'lastChance':
      return tasks.lastChance.map((c) => c.taskId);
  }
}

export interface HomeGroup {
  leafId: string;
  taskIds: string[];
}

/** A task's home leaf: the open window's, else the first window that isn't closed, else the first. */
export function taskHome(taskId: string, index: GuideIndex, view: RunView): string {
  const windows = view.windows.get(taskId) ?? [];
  // Window statuses only: a row must not change heading when its own state changes (§5.3).
  const open = windows.indexOf('open');
  const w =
    open !== -1
      ? open
      : Math.max(
          0,
          windows.findIndex((s) => s !== 'closed'),
        );
  return index.tasks.get(taskId)!.windows[w]!.home;
}

/** §5.5: sheet rows grouped by home section: the open window's home, else the first live window's. */
export function groupByHome(
  taskIds: readonly string[],
  index: GuideIndex,
  view: RunView,
): HomeGroup[] {
  const groups = new Map<string, string[]>();
  for (const id of taskIds) {
    const home = taskHome(id, index, view);
    const list = groups.get(home);
    if (list) list.push(id);
    else groups.set(home, [id]);
  }
  return [...groups]
    .map(([leafId, ids]) => ({ leafId, taskIds: ids }))
    .sort((a, b) => index.pos.get(a.leafId)! - index.pos.get(b.leafId)!);
}
