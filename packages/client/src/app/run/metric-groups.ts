import type { GuideIndex, MetricTasks, RunView } from '@sweep/core';

export const Metric = {
  Here: 'here',
  Now: 'now',
  Closing: 'closing',
  LastChance: 'lastChance',
} as const;
export type Metric = (typeof Metric)[keyof typeof Metric];

export const METRIC_LABEL: Record<Metric, string> = {
  here: 'HERE',
  now: 'NOW',
  closing: 'CLOSING',
  lastChance: 'LAST CHANCE',
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

/** §5.5: sheet rows grouped by home section: the open window's home, else the first live window's. */
export function groupByHome(
  taskIds: readonly string[],
  index: GuideIndex,
  view: RunView,
): HomeGroup[] {
  const groups = new Map<string, string[]>();
  for (const id of taskIds) {
    const status = view.tasks.get(id);
    const windows = view.windows.get(id) ?? [];
    const w =
      status?.kind === 'open'
        ? status.window
        : Math.max(
            0,
            windows.findIndex((s) => s !== 'closed'),
          );
    const home = index.tasks.get(id)!.windows[w]!.home;
    const list = groups.get(home);
    if (list) list.push(id);
    else groups.set(home, [id]);
  }
  return [...groups]
    .map(([leafId, ids]) => ({ leafId, taskIds: ids }))
    .sort((a, b) => index.pos.get(a.leafId)! - index.pos.get(b.leafId)!);
}
