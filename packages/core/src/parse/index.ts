// @sweep/core/parse entry (spec §4.12). Used by the server and the CLI, never by the client.
import type { Guide } from '../model/guide.js';
import type { Issue } from '../model/issue.js';
import { NOT_IMPLEMENTED } from './issue-codes.js';

export { ErrorCode, NOT_IMPLEMENTED, WarningCode } from './issue-codes.js';
export type { IssueCode } from './issue-codes.js';
export { LIMITS } from './limits.js';
export { guideFileName } from './text.js';
export type { Issue, IssueSeverity } from '../model/issue.js';

/** Virtual file map: path to text or raw bytes (spec §3.2). */
export type GuideFiles = Record<string, string | Uint8Array>;

export interface ParseResult {
  guide?: Guide;
  issues: Issue[];
}

/**
 * Parses and validates a guide from a virtual file map (spec §3.2): exactly one of
 * `guide.yaml`, `guide.yml` or `guide.md`. Scaffold stub: session A implements it.
 */
export function parseGuide(files: GuideFiles): ParseResult {
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

/** The JSON Schema for guide files. Stub: implemented in session A, Task 3. */
export function guideJsonSchema(): Record<string, unknown> {
  throw new Error('not implemented yet (session A, Task 3)');
}
