import type { IssueCode } from '../parse/issue-codes.js';

export type { IssueCode };
export type IssueSeverity = 'error' | 'warning';

/**
 * A validation issue (spec §3.6): `{severity, code, message, file, line, column, path}`.
 * `file`, `line`, `column` and `path` are null when an issue has no location
 * (for example `no-root-file`). Session A may refine this shape.
 */
export interface Issue {
  severity: IssueSeverity;
  code: IssueCode;
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
  /** YAML path, e.g. `tasks[12].windows[0].home`. */
  path: string | null;
}
