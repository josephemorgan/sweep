// @sweep/core/parse entry (spec §4.12). Used by the server and the CLI, never by the client.
import type { Guide } from '../model/guide.js';
import type { Issue } from '../model/issue.js';
import { splitFrontMatter } from './container.js';
import { ErrorCode, NOT_IMPLEMENTED } from './issue-codes.js';
import { issue, sortIssues } from './issues.js';
import { readSource } from './text.js';

export { ErrorCode, NOT_IMPLEMENTED, WarningCode } from './issue-codes.js';
export type { IssueCode } from './issue-codes.js';
export { LIMITS } from './limits.js';
export { guideFileName } from './text.js';
export { guideJsonSchema } from './json-schema.js';
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
  // Phase 1: text.
  const { source, issues: textIssues } = readSource(files);
  if (source === undefined) return { issues: sortIssues(textIssues) };
  // Phase 2: container.
  if (source.file === 'guide.md' && splitFrontMatter(source.text) === null) {
    const message = 'a .md guide must start with a closed --- front-matter block';
    return {
      issues: [
        issue('error', ErrorCode.MdFrontMatter, message, source.file, { line: 1, column: 1 }, null),
      ],
    };
  }
  // Later phases (YAML onwards) arrive in the following tasks.
  return { issues: [issue('error', NOT_IMPLEMENTED, NOT_IMPLEMENTED_MESSAGE, null, null, null)] };
}

const NOT_IMPLEMENTED_MESSAGE = 'parseGuide is not implemented yet (arrives in session A).';
