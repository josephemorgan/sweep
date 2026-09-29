import type { Guide } from '../model/guide.js';
import type { RunProgress } from '../model/progress.js';
import type { CoreView, TaskStatus, TaskStatusKind } from './derive.js';
import { indexGuide, isLeaf } from './structure.js';

export interface CardRow {
  taskId: string;
  status: TaskStatus;
  secondChance: boolean;
}
export interface CardCategory {
  categoryId: string;
  rows: CardRow[];
  done: number;
  total: number;
  missed: number;
}
export interface CardView {
  leafId: string;
  categories: CardCategory[];
}
export interface GroupProgress {
  cleared: number;
  total: number;
}
export interface RunSummary {
  leavesCleared: number;
  leavesTotal: number;
  tasksDone: number;
  tasksTotal: number;
}
export interface RunView extends CoreView {
  tracked: Set<string>;
  /** Every leaf. */
  cards: Map<string, CardView>;
  /** Every group. */
  groups: Map<string, GroupProgress>;
  summary: RunSummary;
}

/** What `deriveRun` adds to a `CoreView`. */
export type RunExtras = Pick<RunView, 'tracked' | 'cards' | 'groups' | 'summary'>;

const UNRESOLVED: ReadonlySet<TaskStatusKind> = new Set(['open', 'upcoming', 'missed']);

/**
 * Card membership, counts, group progress and the run summary (§4.8). One pass over the tasks and
 * their windows, so the cost is O(windows), not leaves x tasks.
 */
export function deriveExtras(guide: Guide, progress: RunProgress, core: CoreView): RunExtras {
  const index = indexGuide(guide);

  const tracked = new Set<string>();
  for (const category of guide.categories) {
    if (progress.tracked.get(category.id) ?? category.tracked) tracked.add(category.id);
  }

  // leaf ID -> category ID -> rows, in task file order.
  const byLeaf = new Map<string, Map<string, CardRow[]>>();
  const addRow = (leafId: string, categoryId: string, row: CardRow): void => {
    let cats = byLeaf.get(leafId);
    if (cats === undefined) byLeaf.set(leafId, (cats = new Map()));
    const rows = cats.get(categoryId);
    if (rows === undefined) cats.set(categoryId, [row]);
    else rows.push(row);
  };

  let tasksDone = 0;
  let tasksTotal = 0;
  for (const task of guide.tasks) {
    if (!tracked.has(task.category)) continue;
    const status = core.tasks.get(task.id)!;
    if (status.kind === 'done') tasksDone += 1;
    if (status.kind !== 'dont-care' && status.kind !== 'not-chosen') tasksTotal += 1;

    const first = task.windows[0]!.home;
    addRow(first, task.category, { taskId: task.id, status, secondChance: false });
    if (!UNRESOLVED.has(status.kind)) continue;
    const seen = new Set([first]);
    for (let i = 1; i < task.windows.length; i += 1) {
      const home = task.windows[i]!.home;
      if (seen.has(home)) continue;
      seen.add(home);
      addRow(home, task.category, { taskId: task.id, status, secondChance: true });
    }
  }

  const cards = new Map<string, CardView>();
  for (const leaf of index.leaves) {
    const cats = byLeaf.get(leaf.id);
    const categories: CardCategory[] = [];
    if (cats !== undefined) {
      for (const category of guide.categories) {
        const rows = cats.get(category.id);
        if (rows === undefined) continue;
        let done = 0;
        let total = 0;
        let missed = 0;
        for (const row of rows) {
          const kind = row.status.kind;
          if (kind === 'done') done += 1;
          if (kind === 'missed') missed += 1;
          if (kind !== 'dont-care' && kind !== 'not-chosen') total += 1;
        }
        categories.push({ categoryId: category.id, rows, done, total, missed });
      }
    }
    cards.set(leaf.id, { leafId: leaf.id, categories });
  }

  const clearedPrefix = new Array<number>(index.leaves.length + 1).fill(0);
  index.leaves.forEach((leaf, i) => {
    clearedPrefix[i + 1] = clearedPrefix[i]! + (core.sections.get(leaf.id)!.cleared ? 1 : 0);
  });
  const groups = new Map<string, GroupProgress>();
  for (const [id, section] of index.sections) {
    if (isLeaf(section)) continue;
    const r = index.range.get(id)!;
    groups.set(id, {
      cleared: clearedPrefix[r.last + 1]! - clearedPrefix[r.first]!,
      total: r.last - r.first + 1,
    });
  }

  return {
    tracked,
    cards,
    groups,
    summary: {
      leavesCleared: clearedPrefix[index.leaves.length]!,
      leavesTotal: index.leaves.length,
      tasksDone,
      tasksTotal,
    },
  };
}
