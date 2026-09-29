import type { Issue, IssueCode, IssueSeverity } from '../model/issue.js';
import { formatPath, type PathSegment } from './locate.js';

/** Builds an issue. `at` and `path` are null when the issue has no location (spec §3.6). */
export function issue(
  severity: IssueSeverity,
  code: IssueCode,
  message: string,
  file: string | null,
  at: { line: number; column: number } | null,
  path: readonly PathSegment[] | null,
): Issue {
  return {
    severity,
    code,
    message,
    file,
    line: at?.line ?? null,
    column: at?.column ?? null,
    path: path === null ? null : formatPath(path),
  };
}

/** Sorts issues by `(line ?? 0, column ?? 0)`. The sort is stable and returns a new array. */
export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0),
  );
}
