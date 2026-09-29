// Window phase (plan phase 8): `end-not-last`, `home-not-leaf`, `until-before-from`,
// `home-outside-window` and `window-order`, by route-order leaf position (spec §3.3).
import { indexGuide, isLeaf, type GuideIndex } from '../engine/structure.js';
import { END, type Guide, type Task, type TaskWindow } from '../model/guide.js';
import type { Issue } from '../model/issue.js';
import { ErrorCode } from './issue-codes.js';
import { issue } from './issues.js';
import type { Locator } from './locate.js';
import type { SourceMap } from './normalize.js';
import type { SourceText } from './text.js';

/** The first leaf position of a window's `from`. */
const first = (index: GuideIndex, w: TaskWindow): number => index.range.get(w.from)!.first;

/** The last leaf position of a window's `until` (`END`: the last leaf of the guide). */
const last = (index: GuideIndex, w: TaskWindow): number =>
  w.until === END ? index.leaves.length - 1 : index.range.get(w.until)!.last;

type Report = (code: ErrorCode, message: string, key: 'from' | 'until' | 'home') => void;

/**
 * Checks each task's windows (spec §3.3). Positions are inclusive leaf indexes in route order, so
 * `home` may equal the last leaf of `until`, and a window may not start at or before the previous
 * window's last leaf. Defaults are always valid, so a violation is on an explicit value.
 */
export function checkWindows(
  guide: Guide,
  sources: SourceMap,
  file: SourceText['file'],
  locator: Locator,
): Issue[] {
  const index = indexGuide(guide);
  const issues: Issue[] = [];
  for (const task of guide.tasks) {
    const taskPath = sources.tasks.get(task.id)!;
    for (let i = 0; i < task.windows.length; i += 1) {
      const report: Report = (code, message, key) => {
        const at = [...taskPath, 'windows', i, key];
        issues.push(issue('error', code, message, file, locator.value(at), at));
      };
      checkWindow(index, task, i, report);
    }
  }
  return issues;
}

function checkWindow(index: GuideIndex, task: Task, i: number, report: Report): void {
  const w = task.windows[i]!;
  const label = `task ${task.id}, window ${i + 1}`;
  if (w.until === END && i < task.windows.length - 1) {
    report(ErrorCode.EndNotLast, `${label}: only the last window may end at end`, 'until');
  }
  const homeIsLeaf = isLeaf(index.sections.get(w.home)!);
  if (!homeIsLeaf) {
    report(ErrorCode.HomeNotLeaf, `${label}: home ${w.home} is a group, not a leaf`, 'home');
  }
  const from = first(index, w);
  const until = last(index, w);
  const closesBeforeOpen = until < from;
  if (closesBeforeOpen) {
    const message = `${label}: until ${w.until} comes before from ${w.from}`;
    report(ErrorCode.UntilBeforeFrom, message, 'until');
  }
  if (homeIsLeaf && !closesBeforeOpen) {
    const at = index.pos.get(w.home)!;
    if (at < from || at > until) {
      const message = `${label}: home ${w.home} is outside the window from ${w.from} to ${w.until}`;
      report(ErrorCode.HomeOutsideWindow, message, 'home');
    }
  }
  const previous = task.windows[i - 1];
  // A previous `until: end` is already an end-not-last error; don't pile a window-order on it.
  if (previous !== undefined && previous.until !== END && from <= last(index, previous)) {
    const message = `${label}: from ${w.from} must come after the previous window's until ${previous.until}`;
    report(ErrorCode.WindowOrder, message, 'from');
  }
}
