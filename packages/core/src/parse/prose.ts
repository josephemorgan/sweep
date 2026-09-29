import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Nodes } from 'mdast';
import type { Issue } from '../model/issue.js';
import type { PathSegment } from './locate.js';
import { WarningCode } from './issue-codes.js';
import { issue } from './issues.js';

/**
 * Where prose warnings are reported: at one position (a YAML field's value node), or at each
 * node's own position, given the file line of the markdown's first line (a `.md` body section).
 */
export type ProseLocation = { node: { line: number; column: number } } | { bodyLine: number };

/**
 * Checks one piece of guide prose (spec §3.4): one `md-html` warning per raw HTML node and one
 * `md-image` warning per image or image reference. Code is not HTML or an image in mdast, so it
 * never warns. `path` is the YAML path of the field, or null for a body section.
 */
export function checkProse(
  markdown: string,
  where: ProseLocation,
  file: string,
  path: PathSegment[] | null,
): Issue[] {
  const issues: Issue[] = [];
  // Depth-first in document order, with an explicit stack: deeply nested Markdown can't overflow.
  const stack: Nodes[] = [fromMarkdown(markdown)];
  while (stack.length > 0) {
    const node = stack.pop()!;
    let code: WarningCode | null = null;
    let message = '';
    if (node.type === 'html') {
      code = WarningCode.MdHtml;
      message = 'raw HTML is shown as plain text, not rendered';
    } else if (node.type === 'image' || node.type === 'imageReference') {
      code = WarningCode.MdImage;
      message = 'images are not supported and are not shown';
    }
    if (code !== null) {
      const start = node.position?.start ?? { line: 1, column: 1 };
      const at =
        'node' in where
          ? where.node
          : { line: where.bodyLine + start.line - 1, column: start.column };
      issues.push(issue('warning', code, message, file, at, path));
    }
    const children: Nodes[] = 'children' in node ? node.children : [];
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]!);
  }
  return issues;
}
