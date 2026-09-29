import { describe, expect, it } from 'vitest';
import { parseGuide, type Issue } from '../../src/parse/index.js';
import { readFixture } from '../helpers.js';

const HEAD = 'sweep: 1\ngame: G\nsections:\n  - id: a\n    title: A\n    overview: One.\n';

/** A guide whose only section has the given YAML lines appended (already indented). */
function withSection(extra: string): ReturnType<typeof parseGuide> {
  return parseGuide({ 'guide.yaml': `${HEAD}${extra}` });
}
const codes = (issues: Issue[]): string[] => issues.map((i) => i.code);

describe('prose warnings', () => {
  it('gives two md-html warnings for <kbd>A</kbd>, at the how value', () => {
    const r = parseGuide({ 'guide.yaml': readFixture('valid/md-html.yaml') });
    expect(r.guide).toBeDefined();
    const html = r.issues.filter((i) => i.code === 'md-html');
    expect(html).toHaveLength(2);
    for (const w of html) {
      expect(w).toMatchObject({ severity: 'warning', line: 16, column: 10, path: 'tasks[0].how' });
    }
  });

  it('ignores html-looking text in inline code and code blocks', () => {
    const r = withSection(
      '    walkthrough: "`<b>` in code\\n\\n    <i>indented</i>\\n\\n```\\n<u>x</u>\\n```"\n',
    );
    expect(r.guide).toBeDefined();
    expect(codes(r.issues)).toEqual([]);
  });

  it('warns md-image for an inline image in a walkthrough', () => {
    const r = parseGuide({ 'guide.yaml': readFixture('valid/md-image.yaml') });
    expect(r.guide).toBeDefined();
    expect(r.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'md-image',
        line: 8,
        column: 18,
        path: 'sections[0].walkthrough',
      }),
    ]);
  });

  it('warns md-image for a reference-style image', () => {
    const r = withSection('    walkthrough: "[x]: m.png\\n\\n![x]"\n');
    expect(codes(r.issues)).toEqual(['md-image']);
  });

  it('does not warn for a plain link', () => {
    const r = withSection('    walkthrough: "[a link](https://example.com)"\n');
    expect(codes(r.issues)).toEqual([]);
  });

  it('reports a body section at the node position in the file', () => {
    const r = parseGuide({ 'guide.md': readFixture('valid/md-html-body.md') });
    expect(r.guide).toBeDefined();
    expect(r.issues).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'md-html', line: 12, column: 5 }),
    ]);
  });

  it('finds html in a second body section', () => {
    const md =
      '---\nsweep: 1\ngame: G\nsections:\n  - id: a\n    title: A\n    overview: One.\n  - id: b\n    title: B\n    overview: Two.\n---\n# a\n\nfine\n\n# b\n\n<div>x</div>\n';
    const r = parseGuide({ 'guide.md': md });
    expect(r.issues).toEqual([expect.objectContaining({ code: 'md-html', line: 18, column: 1 })]);
  });
});
