import { describe, expect, it } from 'vitest';
import { parseGuide, type Issue } from '../../src/parse/index.js';
import { loadGuide, readFixture } from '../helpers.js';
import type { Section } from '../../src/index.js';

const LANTERN_MD = readFixture('valid/lantern-keep.md');
const LANTERN_YAML = readFixture('valid/lantern-keep.yaml');

const HEADER = '---\nsweep: 1\ngame: G\nsections:\n  - id: a\n    title: A\n    overview: One.\n';
const MINI = `${HEADER}  - id: b\n    title: B\n    overview: Two.\n---\n`;

function findSection(sections: readonly Section[], id: string): Section | undefined {
  for (const s of sections) {
    if (s.id === id) return s;
    const found = findSection(s.children, id);
    if (found) return found;
  }
  return undefined;
}

function errors(issues: Issue[]): Issue[] {
  return issues.filter((i) => i.severity === 'error');
}

describe('markdown container equivalence', () => {
  it('lantern-keep.md and lantern-keep.yaml give the same model', () => {
    const md = parseGuide({ 'guide.md': LANTERN_MD });
    const yaml = parseGuide({ 'guide.yaml': LANTERN_YAML });
    expect(md.issues).toEqual([]);
    expect(yaml.issues).toEqual([]);
    expect(md.guide).toEqual(yaml.guide);
    expect(md.guide).toEqual(loadGuide('lantern-keep'));
  });

  it('is unchanged by CRLF, a BOM, and fence lines with trailing spaces', () => {
    const messy = '\uFEFF' + LANTERN_MD.replace(/^---$/gm, '--- ').replace(/\n/g, '\r\n');
    const result = parseGuide({ 'guide.md': messy });
    expect(result.issues).toEqual([]);
    expect(result.guide).toEqual(loadGuide('lantern-keep'));
  });

  it('is unchanged by a missing final newline', () => {
    const result = parseGuide({ 'guide.md': LANTERN_MD.trimEnd() });
    expect(result.issues).toEqual([]);
    expect(result.guide).toEqual(loadGuide('lantern-keep'));
  });
});

describe('markdown body splitting', () => {
  it('keeps # lines inside fenced and indented code in the walkthrough', () => {
    const body = [
      '# a',
      '',
      '```bash',
      '# not a heading',
      '```',
      '',
      '~~~',
      '# also not',
      '~~~',
      '',
      '    # code',
      '',
    ].join('\n');
    const result = parseGuide({ 'guide.md': `${MINI}\n${body}` });
    expect(result.issues).toEqual([]);
    const a = findSection(result.guide!.sections, 'a')!;
    expect(a.walkthrough).toBe(
      '```bash\n# not a heading\n```\n\n~~~\n# also not\n~~~\n\n    # code',
    );
    expect(findSection(result.guide!.sections, 'b')!.walkthrough).toBeNull();
  });

  it('gives an empty section body a null walkthrough', () => {
    const result = parseGuide({ 'guide.md': `${MINI}\n# a\n# b\n\nText.\n` });
    expect(result.issues).toEqual([]);
    expect(findSection(result.guide!.sections, 'a')!.walkthrough).toBeNull();
    expect(findSection(result.guide!.sections, 'b')!.walkthrough).toBe('Text.');
  });

  it('lets a heading name a group', () => {
    const text = LANTERN_MD + '\n# act-1\n\nThe first act.\n';
    const result = parseGuide({ 'guide.md': text });
    expect(result.issues).toEqual([]);
    expect(findSection(result.guide!.sections, 'act-1')!.walkthrough).toBe('The first act.');
  });

  it('treats #village without a space as text, not a heading', () => {
    const result = parseGuide({ 'guide.md': `${MINI}\n# a\n\n#b is a tag\n` });
    expect(result.issues).toEqual([]);
    expect(findSection(result.guide!.sections, 'a')!.walkthrough).toBe('#b is a tag');
  });

  it('reports md-heading for closing hashes', () => {
    const result = parseGuide({ 'guide.md': `${MINI}\n# a #\n` });
    expect(errors(result.issues).map((i) => [i.code, i.line, i.column])).toEqual([
      ['md-heading', 13, 1],
    ]);
    expect(result.issues[0]!.message).toBe(
      'level-1 headings must be section IDs; use `##` or deeper inside a walkthrough',
    );
  });

  it('reports md-heading for an indented level-1 heading', () => {
    const result = parseGuide({ 'guide.md': `${MINI}\n# a\n\n  # b\n` });
    expect(errors(result.issues).map((i) => [i.code, i.line])).toEqual([['md-heading', 15]]);
  });

  it('reports md-unknown-section for a task ID', () => {
    const text = `${HEADER}---\n\n# a\n`.replace(
      'overview: One.\n',
      'overview: One.\ncategories:\n  x:\n    name: X\n    about: Y\ntasks:\n  - id: t\n    title: T\n    category: x\n    windows:\n      - from: a\n',
    );
    const result = parseGuide({ 'guide.md': text + '\n# t\n' });
    const errs = errors(result.issues);
    expect(errs.map((i) => i.code)).toEqual(['md-unknown-section']);
    expect(errs[0]!.message).toContain('task');
  });

  it('warns about a preamble but still builds the guide', () => {
    const result = parseGuide({ 'guide.md': readFixture('valid/md-preamble.md') });
    expect(result.guide).toBeDefined();
    expect(result.issues.map((i) => i.code)).toEqual(['md-preamble']);
    expect(findSection(result.guide!.sections, 'start')!.walkthrough).toBe(
      'The first walkthrough.',
    );
  });

  it('warns about a preamble when there are no headings at all', () => {
    const result = parseGuide({ 'guide.md': `${MINI}\nJust text.\n` });
    expect(result.issues.map((i) => [i.code, i.line])).toEqual([['md-preamble', 13]]);
  });

  it('gives no issues for a body of only blank lines', () => {
    const result = parseGuide({ 'guide.md': `${MINI}\n\n\n` });
    expect(result.issues).toEqual([]);
  });
});

describe.each([
  ['md-heading.md', 'md-heading'],
  ['md-heading-setext.md', 'md-heading'],
  ['md-heading-nested.md', 'md-heading'],
  ['md-unknown-section.md', 'md-unknown-section'],
  ['md-duplicate-section.md', 'md-duplicate-section'],
  ['walkthrough-twice.md', 'walkthrough-twice'],
])('invalid fixture %s', (fixture, code) => {
  it(`gives exactly one ${code} error and no guide`, () => {
    const result = parseGuide({ 'guide.md': readFixture(`invalid/${fixture}`) });
    expect(result.guide).toBeUndefined();
    expect(result.issues.map((i) => [i.severity, i.code])).toEqual([['error', code]]);
  });
});

describe('walkthrough-twice with an empty inline walkthrough', () => {
  it('still counts the key', () => {
    const text = `${HEADER.replace('overview: One.\n', 'overview: One.\n    walkthrough: ""\n')}---\n\n# a\n\nText.\n`;
    const result = parseGuide({ 'guide.md': text });
    expect(result.issues.map((i) => [i.code, i.line])).toEqual([['walkthrough-twice', 11]]);
  });
});

describe('markdown walkthrough limit', () => {
  // The raw slice after `# a` starts with the heading's newline, so it is 1 + n characters.
  it('accepts a body walkthrough of exactly 100,000 characters', () => {
    const result = parseGuide({ 'guide.md': `${MINI}# a\n${'x'.repeat(99_999)}` });
    expect(result.issues).toEqual([]);
    expect(result.guide).toBeDefined();
  });

  it('reports limit at the heading for 100,001 characters', () => {
    const result = parseGuide({ 'guide.md': `${MINI}# a\n${'x'.repeat(100_000)}` });
    expect(result.guide).toBeUndefined();
    expect(result.issues.map((i) => [i.code, i.line, i.column, i.path])).toEqual([
      ['limit', 12, 1, null],
    ]);
  });

  it('measures the slice before trimming', () => {
    const result = parseGuide({ 'guide.md': `${MINI}# a\n${'\n'.repeat(100_000)}x` });
    expect(result.issues.map((i) => i.code)).toEqual(['limit']);
  });
});
