import type { CoreView, TaskStatus } from './derive.js';

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
