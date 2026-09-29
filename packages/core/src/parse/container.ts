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
