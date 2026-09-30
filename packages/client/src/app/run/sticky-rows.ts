import type { CardCategory, CardRow, TaskStatus } from '@sweep/core';

function stickyRows(
  shown: readonly CardRow[],
  next: readonly CardRow[],
  statusOf: (id: string) => TaskStatus | undefined,
): CardRow[] {
  const fresh = new Map(next.map((r) => [r.taskId, r]));
  const kept: CardRow[] = [];
  for (const r of shown) {
    const row = fresh.get(r.taskId);
    if (row) {
      kept.push(row);
      continue;
    }
    // A task the guide no longer has cannot stay on screen.
    const status = statusOf(r.taskId);
    if (status) kept.push({ ...r, status });
  }
  const seen = new Set(shown.map((r) => r.taskId));
  return [...kept, ...next.filter((r) => !seen.has(r.taskId))];
}

/**
 * §5.3: while a card stays open, rows already on screen keep their place (with fresh status) even
 * when membership (§4.8) drops them; new rows are appended. Counts follow membership. A category
 * that has become untracked disappears at once.
 */
export function stickyCategories(
  shown: readonly CardCategory[],
  next: readonly CardCategory[],
  statusOf: (taskId: string) => TaskStatus | undefined,
  tracked: ReadonlySet<string>,
): CardCategory[] {
  const before = new Map(shown.map((c) => [c.categoryId, c]));
  const out = next.map((c) => {
    const prev = before.get(c.categoryId);
    return prev ? { ...c, rows: stickyRows(prev.rows, c.rows, statusOf) } : c;
  });
  const present = new Set(next.map((c) => c.categoryId));
  for (const prev of shown) {
    if (!present.has(prev.categoryId) && tracked.has(prev.categoryId)) {
      out.push({
        ...prev,
        rows: stickyRows(prev.rows, [], statusOf),
        done: 0,
        total: 0,
        missed: 0,
      });
    }
  }
  return out;
}
