import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Heading, Root, RootContent } from 'mdast';
import type { Issue } from '../model/issue.js';
import { ErrorCode, WarningCode } from './issue-codes.js';
import { issue } from './issues.js';

const FENCE = /^---[ \t]*$/;

export interface SplitMarkdown {
  frontMatter: string;
  /** 1-based line of the first YAML line: 2. */
  frontMatterLine: number;
  body: string;
  /** 1-based line of the first body line. */
  bodyLine: number;
}

/**
 * Splits a `.md` guide into front matter and body (spec §3.2). Line 1 must be a `---` fence and
 * the front matter closes at the next fence line. Returns null when there is no closed block.
 * `text` has its newlines already normalized to `\n`.
 */
export function splitFrontMatter(text: string): SplitMarkdown | null {
  const lines = text.split('\n');
  if (!FENCE.test(lines[0] ?? '')) return null;
  const close = lines.findIndex((line, i) => i > 0 && FENCE.test(line));
  if (close < 0) return null;
  return {
    frontMatter: lines
      .slice(1, close)
      .map((line) => `${line}\n`)
      .join(''),
    frontMatterLine: 2,
    body: lines.slice(close + 1).join('\n'),
    bodyLine: close + 2,
  };
}

const SECTION_HEADING = /^# ([a-z][a-z0-9]*(?:-[a-z0-9]+)*)[ \t]*$/;
const HEADING_MESSAGE =
  'level-1 headings must be section IDs; use `##` or deeper inside a walkthrough';

export interface BodySections {
  /** Raw text under each section's heading, by section ID. Normalization trims it. */
  walkthroughs: Map<string, string>;
  issues: Issue[];
}

interface SplitPoint {
  id: string;
  /** 1-based line within the body. */
  line: number;
  start: number;
  end: number;
}

/**
 * Splits a `.md` body into walkthroughs (plan "Markdown body"). Root-level level-1 ATX headings
 * of the form `# <section-id>` are split points; any other level-1 heading is `md-heading`.
 * `bodyLine` is the file line of the body's first line. `sectionIds` holds every raw section ID,
 * and `inlineWalkthroughIds` those whose front matter has a `walkthrough` key.
 */
export function splitBody(
  body: string,
  bodyLine: number,
  sectionIds: ReadonlySet<string>,
  inlineWalkthroughIds: ReadonlySet<string>,
  taskIds: ReadonlySet<string> = new Set(),
): BodySections {
  const file = 'guide.md';
  const issues: Issue[] = [];
  const at = (line: number): { line: number; column: number } => ({
    line: line + bodyLine - 1,
    column: 1,
  });
  const lines = body.split('\n');
  const points: SplitPoint[] = [];
  const tree = fromMarkdown(body);
  const rootHeadings = new Set<RootContent>(tree.children);
  for (const heading of headings(tree)) {
    const pos = heading.position;
    if (heading.depth !== 1 || pos === undefined) continue;
    const start = pos.start.offset ?? 0;
    const match = rootHeadings.has(heading)
      ? SECTION_HEADING.exec(lines[pos.start.line - 1]!)
      : null;
    if (match === null) {
      issues.push(
        issue('error', ErrorCode.MdHeading, HEADING_MESSAGE, file, at(pos.start.line), null),
      );
    } else {
      points.push({ id: match[1]!, line: pos.start.line, start, end: pos.end.offset ?? start });
    }
  }
  const walkthroughs = new Map<string, string>();
  const seen = new Set<string>();
  points.forEach((point, i) => {
    let error: Issue | null = null;
    if (!sectionIds.has(point.id)) {
      const what = taskIds.has(point.id) ? 'a task, not a section' : 'not a section';
      const message = `heading "${point.id}" is ${what}; level-1 headings must be section IDs`;
      error = issue('error', ErrorCode.MdUnknownSection, message, file, at(point.line), null);
    } else if (seen.has(point.id)) {
      const message = `section "${point.id}" already has a body heading`;
      error = issue('error', ErrorCode.MdDuplicateSection, message, file, at(point.line), null);
    } else if (inlineWalkthroughIds.has(point.id)) {
      const message = `section "${point.id}" has a walkthrough in the front matter and a body heading`;
      error = issue('error', ErrorCode.WalkthroughTwice, message, file, at(point.line), null);
    }
    if (error !== null) {
      issues.push(error);
      return;
    }
    seen.add(point.id);
    const next = points[i + 1];
    walkthroughs.set(
      point.id,
      body.slice(point.end, next === undefined ? body.length : next.start),
    );
  });
  const preamble = body.slice(0, points[0]?.start ?? body.length).split('\n');
  const first = preamble.findIndex((line) => line.trim() !== '');
  if (first >= 0) {
    const message = 'text before the first heading belongs to no section and is ignored';
    issues.push(issue('warning', WarningCode.MdPreamble, message, file, at(first + 1), null));
  }
  return { walkthroughs, issues };
}

/** Every heading in the tree, in document order. */
function headings(node: Root | RootContent): Heading[] {
  if (node.type === 'heading') return [node];
  const children = 'children' in node ? (node.children as RootContent[]) : [];
  return children.flatMap(headings);
}
