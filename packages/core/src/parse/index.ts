// @sweep/core/parse entry (spec §4.12). Used by the server and the CLI, never by the client.
import type { Guide } from '../model/guide.js';
import type { Issue } from '../model/issue.js';
import { splitBody, splitFrontMatter } from './container.js';
import { checkGraph } from './graph.js';
import { ErrorCode } from './issue-codes.js';
import { issue, sortIssues } from './issues.js';
import type { Locator, PathSegment } from './locate.js';
import { checkProse } from './prose.js';
import { normalize } from './normalize.js';
import { checkReferences } from './references.js';
import type { RawGuide } from './schema.js';
import { checkStructure } from './structure.js';
import { readSource } from './text.js';
import { checkWindows } from './windows.js';
import { parseYamlSource } from './yaml.js';

export { ErrorCode, WarningCode } from './issue-codes.js';
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
 * `guide.yaml`, `guide.yml` or `guide.md`. `guide` is set only when there are no errors.
 */
export function parseGuide(files: GuideFiles): ParseResult {
  // Phase 1: text.
  const { source, issues: textIssues } = readSource(files);
  if (source === undefined) return { issues: sortIssues(textIssues) };
  // Phase 2: container.
  let yamlText = source.text;
  let lineOffset = 0;
  let bodyStart: { body: string; line: number } | null = null;
  if (source.file === 'guide.md') {
    const split = splitFrontMatter(source.text);
    if (split === null) {
      const message = 'a .md guide must start with a closed --- front-matter block';
      const at = { line: 1, column: 1 };
      return { issues: [issue('error', ErrorCode.MdFrontMatter, message, source.file, at, null)] };
    }
    yamlText = split.frontMatter;
    lineOffset = split.frontMatterLine - 1;
    bodyStart = { body: split.body, line: split.bodyLine };
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
  // Phase 5: identity and references.
  const { issues: referenceIssues, blocking } = checkReferences(raw, source.file, parsed.locator);
  const issues = [...structureIssues, ...referenceIssues];
  if (blocking) return { issues: sortIssues(issues) };
  // Phase 6: the `.md` body (needs the raw section IDs), then normalize. Body errors don't block
  // normalization, but they do block `guide`.
  let bodyWalkthroughs = new Map<string, string>();
  let bodyLines = new Map<string, number>();
  if (bodyStart !== null) {
    const ids = new Set<string>();
    const inline = new Set<string>();
    const visit = (section: RawGuide['sections'][number]): void => {
      ids.add(section.id);
      if (section.walkthrough !== undefined) inline.add(section.id);
      (section.sections ?? []).forEach(visit);
    };
    raw.sections.forEach(visit);
    const taskIds = new Set((raw.tasks ?? []).map((task) => task.id));
    const body = splitBody(bodyStart.body, bodyStart.line, ids, inline, taskIds);
    bodyWalkthroughs = body.walkthroughs;
    bodyLines = body.walkthroughLines;
    issues.push(...body.issues);
  }
  const { guide, sources } = normalize(raw, bodyWalkthroughs);
  // Phase 7: graph.
  issues.push(...checkGraph(guide, sources, source.file, parsed.locator));
  // Phase 8: windows. Independent of the requires graph, so it runs after graph errors too.
  issues.push(...checkWindows(guide, sources, source.file, parsed.locator));
  // Phase 10: prose warnings, on the source text (not the trimmed model).
  issues.push(...checkAllProse(raw, bodyWalkthroughs, bodyLines, source.file, parsed.locator));
  const hasErrors = issues.some((i) => i.severity === 'error');
  return { guide: hasErrors ? undefined : guide, issues: sortIssues(issues) };
}

/** Runs `checkProse` over every section `walkthrough` and task `how` (YAML fields and `.md` bodies). */
function checkAllProse(
  raw: RawGuide,
  bodyWalkthroughs: Map<string, string>,
  bodyLines: Map<string, number>,
  file: string,
  locator: Locator,
): Issue[] {
  const issues: Issue[] = [];
  const field = (text: string | undefined, path: PathSegment[]): void => {
    if (text === undefined) return;
    issues.push(...checkProse(text, { node: locator.value(path) }, file, path));
  };
  const visit = (section: RawGuide['sections'][number], path: PathSegment[]): void => {
    field(section.walkthrough, [...path, 'walkthrough']);
    const bodyLine = bodyLines.get(section.id);
    const body = bodyWalkthroughs.get(section.id);
    if (body !== undefined && bodyLine !== undefined) {
      issues.push(...checkProse(body, { bodyLine }, file, null));
    }
    (section.sections ?? []).forEach((child, i) => visit(child, [...path, 'sections', i]));
  };
  raw.sections.forEach((section, i) => visit(section, ['sections', i]));
  (raw.tasks ?? []).forEach((task, i) => field(task.how, ['tasks', i, 'how']));
  return issues;
}
