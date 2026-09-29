import { describe, expect, it, vi } from 'vitest';
import { parseYamlSource } from '../../src/parse/yaml.js';

function parse(text: string, lineOffset = 0): ReturnType<typeof parseYamlSource> {
  return parseYamlSource(text, 'guide.yaml', lineOffset);
}

function aliases(count: number): string {
  return `sweep: 1\nx: &a 1\nl: [${Array<string>(count).fill('*a').join(', ')}]\n`;
}

describe('parseYamlSource', () => {
  it('expands anchors and aliases', () => {
    const text = [
      'sweep: 1',
      'categories:',
      '  loot: &cat',
      '    name: Loot',
      '  cards: *cat',
      'sections:',
      '  - id: start',
      '    overview: &o Somewhere.',
      '  - id: forest',
      '    overview: *o',
      '  - id: cave',
      '    overview: *o',
      '',
    ].join('\n');
    const { parsed, issues } = parse(text);
    expect(issues).toEqual([]);
    expect(parsed?.value).toEqual({
      sweep: 1,
      categories: { loot: { name: 'Loot' }, cards: { name: 'Loot' } },
      sections: [
        { id: 'start', overview: 'Somewhere.' },
        { id: 'forest', overview: 'Somewhere.' },
        { id: 'cave', overview: 'Somewhere.' },
      ],
    });
  });

  it('uses YAML 1.2 core schema scalars', () => {
    const { parsed, issues } = parse('sweep: 1\nid: yes\nn: 0x1F\nnone: ~\nflag: true\n');
    expect(issues).toEqual([]);
    expect(parsed?.value).toEqual({ sweep: 1, id: 'yes', n: 31, none: null, flag: true });
  });

  it('allows core tags', () => {
    const { parsed, issues } = parse('sweep: !!int 1\nid: !!str 12\nm: !!map {a: !!null ~}\n');
    expect(issues).toEqual([]);
    expect(parsed?.value).toEqual({ sweep: 1, id: '12', m: { a: null } });
  });

  it('gives a locator for the parsed document', () => {
    const { parsed } = parse('# comment\nsweep: 1\ngame: Tiny\n', 1);
    expect(parsed?.locator.value(['game'])).toEqual({ line: 4, column: 7 });
  });

  it('allows 100 alias expansions and rejects 101 at the first alias', () => {
    expect(parse(aliases(100)).issues).toEqual([]);
    expect(parse(aliases(101)).issues).toEqual([
      expect.objectContaining({ code: 'yaml-syntax', line: 3, column: 5, path: 'l[0]' }),
    ]);
  });

  it('reports an alias to an undefined anchor at that alias', () => {
    expect(parse('sweep: 1\na: &x 1\nb: *nope\n').issues).toEqual([
      expect.objectContaining({ code: 'yaml-syntax', line: 3, column: 4, path: 'b' }),
    ]);
  });

  it('reports an alias inside its own anchor at the alias, and stops', () => {
    const text = 'sweep: 1\nsections: &s [{id: a, sections: *s}]\n';
    expect(parse(text)).toEqual({
      issues: [
        expect.objectContaining({
          code: 'yaml-syntax',
          message: 'YAML alias *s refers to a node that contains it',
          line: 2,
          column: 33,
          path: 'sections[0].sections',
        }),
      ],
    });
  });

  it('reports an alias to an ancestor mapping', () => {
    const text = 'sweep: 1\ng: &g\n  id: g\n  sections:\n    - *g\n';
    expect(parse(text).issues).toEqual([
      expect.objectContaining({
        code: 'yaml-syntax',
        message: 'YAML alias *g refers to a node that contains it',
        line: 5,
        column: 7,
        path: 'g.sections[0]',
      }),
    ]);
  });

  it('still allows an alias to an earlier sibling', () => {
    expect(parse('sweep: 1\na: &x {b: 1}\nc: [*x, *x]\n').issues).toEqual([]);
  });

  it('never emits a process warning with guide text', () => {
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    try {
      parse('sweep: 1\n? [secret, key]\n: 1\n');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('reports the source text of an out-of-range sweep number', () => {
    expect(parse('sweep: 1e400\n').issues).toEqual([
      expect.objectContaining({
        code: 'format-version',
        message: 'sweep is 1e400, but Sweep only reads sweep: 1',
      }),
    ]);
  });

  it('reports a nested duplicate key at the second key with its path', () => {
    const text = 'sweep: 1\nsections:\n  - id: a\n    title: A\n    title: B\n';
    expect(parse(text).issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'yaml-syntax',
        file: 'guide.yaml',
        line: 5,
        column: 5,
        path: 'sections[0].title',
      }),
    ]);
  });

  it('reports every duplicate, not just the first', () => {
    const text = 'sweep: 1\na: 1\na: 2\na: 3\ncategories:\n  x: {}\n  x: {}\n';
    expect(parse(text).issues.map((i) => [i.code, i.line, i.column])).toEqual([
      ['yaml-syntax', 3, 1],
      ['yaml-syntax', 4, 1],
      ['id-duplicate', 7, 3],
    ]);
  });

  it('reports a duplicate category key as id-duplicate only at the top level', () => {
    const text = 'sweep: 1\nx:\n  categories:\n    a: 1\n    a: 2\n';
    expect(parse(text).issues).toEqual([
      expect.objectContaining({ code: 'yaml-syntax', line: 5, column: 5 }),
    ]);
  });

  it('reports custom and non-core tags at the tagged node', () => {
    const text = 'sweep: 1\na: !foo x\nb: !!binary aGk=\nc: !!set {x}\nd: ! y\n';
    expect(parse(text).issues.map((i) => [i.code, i.line, i.column, i.path])).toEqual([
      ['yaml-syntax', 2, 9, 'a'],
      ['yaml-syntax', 3, 13, 'b'],
      ['yaml-syntax', 4, 10, 'c'],
      ['yaml-syntax', 5, 6, 'd'],
    ]);
  });

  it('reports one yaml-syntax issue per position', () => {
    const text = 'sweep: 1\nsections:\n  - id: a\n     title: A\n    overview: x\n';
    expect(parse(text).issues.map((i) => [i.code, i.line, i.column])).toEqual([
      ['yaml-syntax', 3, 9],
    ]);
  });

  it('shifts issue lines by lineOffset', () => {
    expect(parse('sweep: 1\na: 1\na: 2\n', 1).issues).toEqual([
      expect.objectContaining({ code: 'yaml-syntax', line: 4, column: 1 }),
    ]);
  });

  describe('format-version', () => {
    it.each([
      ['a list root', '- sweep: 1\n', 1, 1, null],
      ['a scalar root', '# comment\njust text\n', 2, 1, null],
      ['an empty file', '', 1, 1, null],
      ['a comment-only file', '# nothing\n', 1, 1, null],
      ['a missing sweep key', '# comment\ngame: Tiny\n', 2, 1, 'sweep'],
      ['sweep: 2', 'sweep: 2\n', 1, 8, 'sweep'],
      ['sweep as a string', "sweep: '1'\n", 1, 8, 'sweep'],
      ['an empty sweep value', 'sweep:\ngame: Tiny\n', 1, 7, 'sweep'],
    ])('rejects %s', (_name, text, line, column, path) => {
      const { parsed, issues } = parse(text);
      expect(parsed).toBeUndefined();
      expect(issues).toEqual([
        expect.objectContaining({ severity: 'error', code: 'format-version', line, column, path }),
      ]);
    });

    it('is not checked when there is a YAML error', () => {
      expect(parse('a: 1\na: 2\n').issues.map((i) => i.code)).toEqual(['yaml-syntax']);
    });
  });
});
