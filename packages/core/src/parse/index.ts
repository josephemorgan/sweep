// @sweep/core/parse entry (spec §4.12). Used by the server and the CLI, never by the client.
import type { Guide } from '../model/guide.js';
import type { Issue } from '../model/issue.js';
import { splitFrontMatter } from './container.js';
import { ErrorCode, NOT_IMPLEMENTED } from './issue-codes.js';
import { issue, sortIssues } from './issues.js';
import { checkStructure } from './structure.js';
import { readSource } from './text.js';
import { parseYamlSource } from './yaml.js';

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
  let yamlText = source.text;
  let lineOffset = 0;
  if (source.file === 'guide.md') {
    const split = splitFrontMatter(source.text);
    if (split === null) {
      const message = 'a .md guide must start with a closed --- front-matter block';
      const at = { line: 1, column: 1 };
      return { issues: [issue('error', ErrorCode.MdFrontMatter, message, source.file, at, null)] };
    }
    yamlText = split.frontMatter;
    lineOffset = split.frontMatterLine - 1;
  }
  // Phase 3: YAML and format version.
  const { parsed, issues: yamlIssues } = parseYamlSource(yamlText, source.file, lineOffset);
  if (parsed === undefined) return { issues: sortIssues(yamlIssues) };
  // Phase 4: structure.
  const { raw, issues: structureIssues } = checkStructure(
    parsed.value,
    source.file,
    parsed.locator,
  );
  if (raw === undefined) return { issues: sortIssues(structureIssues) };
  // Later phases (identity and references onwards) arrive in the following tasks.
  const notImplemented = issue('error', NOT_IMPLEMENTED, NOT_IMPLEMENTED_MESSAGE, null, null, null);
  return { issues: sortIssues([...structureIssues, notImplemented]) };
}

const NOT_IMPLEMENTED_MESSAGE = 'parseGuide is not implemented yet (arrives in session A).';
