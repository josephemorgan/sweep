// @sweep/core/parse entry (spec §4.12). Used by the server and the CLI, never by the client.
import type { Guide } from '../model/guide.js';
import type { Issue } from '../model/issue.js';
import { NOT_IMPLEMENTED } from './issue-codes.js';

export { ErrorCode, NOT_IMPLEMENTED, WarningCode } from './issue-codes.js';
export type { IssueCode } from './issue-codes.js';
export { LIMITS } from './limits.js';
export type { Issue, IssueSeverity } from '../model/issue.js';

export interface ParseResult {
  guide?: Guide;
  issues: Issue[];
}

/**
 * Parses and validates a guide from a virtual file map (spec §3.2): exactly one of
 * `guide.yaml`, `guide.yml` or `guide.md`. Scaffold stub: session A implements it.
 */
export function parseGuide(files: Record<string, string>): ParseResult {
  void files;
  return {
    issues: [
      {
        severity: 'error',
        code: NOT_IMPLEMENTED,
        message: 'parseGuide is not implemented yet (arrives in session A).',
        file: null,
        line: null,
        column: null,
        path: null,
      },
    ],
  };
}
