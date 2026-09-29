import { describe, expect, it, vi } from 'vitest';
import { firstUnstorable } from '../../src/parse/text.js';
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

  describe('strings Postgres can not store', () => {
    const MESSAGE =
      "this string contains a NUL character (U+0000) or an unpaired surrogate, which can't be stored";

    it.each([
      ['\\0', 'a\\0b'],
      ['\\u0000', '\\u0000'],
      ['\\x00', 'x\\x00'],
      ['\\U00000000', '\\U00000000'],
      ['a lone high surrogate', '\\ud800'],
      ['a lone low surrogate', 'a\\udc00'],
      ['a reversed pair', '\\udc00\\ud800'],
      ['a \\U surrogate', '\\U0000D800'],
    ])('reports %s from an escape at the scalar', (_name, escaped) => {
      const { parsed, issues } = parse(`sweep: 1\ngame: G\nsections:\n  - title: "${escaped}"\n`);
      expect(parsed).toBeUndefined();
      expect(issues).toEqual([
        expect.objectContaining({
          severity: 'error',
          code: 'encoding',
          message: MESSAGE,
          file: 'guide.yaml',
          line: 4,
          column: 12,
          path: 'sections[0].title',
        }),
      ]);
    });

    it('reports a bad key at the key, with the path of its mapping', () => {
      expect(parse('sweep: 1\ncategories:\n  "a\\0": {}\n').issues).toEqual([
        expect.objectContaining({ code: 'encoding', line: 3, column: 3, path: 'categories' }),
      ]);
    });

    it.each([
      ['a nested map', 'sweep: 1\nx:\n  "a\\0": 1\n  "a\\0": 2\n'],
      ['categories', 'sweep: 1\ncategories:\n  "a\\ud800": {}\n  "a\\ud800": {}\n'],
    ])('reports only encoding for a repeated bad key in %s', (_name, text) => {
      expect(parse(text).issues.map((i) => [i.code, i.line, i.column])).toEqual([
        ['encoding', 3, 3],
        ['encoding', 4, 3],
      ]);
    });

    it.each([
      [
        'a bad value',
        'sweep: 1\n"a\\0": "\\0"\n',
        [
          ['encoding', 2, 1, ''],
          ['encoding', 2, 8, ''],
        ],
      ],
      [
        'a nested bad value',
        'sweep: 1\nx:\n  "a\\0": {b: "\\0"}\n',
        [
          ['encoding', 3, 3, 'x'],
          ['encoding', 3, 14, 'x.b'],
        ],
      ],
      [
        'a custom tag',
        'sweep: 1\n"a\\0": !foo x\n',
        [
          ['encoding', 2, 1, ''],
          ['yaml-syntax', 2, 13, ''],
        ],
      ],
      [
        'an undefined alias',
        'sweep: 1\n"a\\0": *nope\n',
        [
          ['encoding', 2, 1, ''],
          ['yaml-syntax', 2, 8, ''],
        ],
      ],
    ])('keeps a bad key out of the paths and messages under it: %s', (_name, text, expected) => {
      const { issues } = parse(text);
      expect(issues.map((i) => [i.code, i.line, i.column, i.path])).toEqual(expected);
      for (const i of issues) {
        expect(firstUnstorable(i.path ?? '')).toBeLessThan(0);
        expect(firstUnstorable(i.message)).toBeLessThan(0);
      }
    });

    it('reports a multi-line scalar at its start, and each bad scalar once', () => {
      const text = 'sweep: 1\na: [x, "one\n  two \\0"]\nb: "\\ud800"\nc: *nope\n';
      expect(parse(text).issues.map((i) => [i.code, i.line, i.column, i.path])).toEqual([
        ['encoding', 2, 8, 'a[1]'],
        ['encoding', 4, 4, 'b'],
        ['yaml-syntax', 5, 4, 'c'],
      ]);
    });

    it('reports an anchored bad scalar once, not at its aliases', () => {
      const text = 'sweep: 1\na: &x "\\0"\nb: [*x, *x]\n';
      expect(parse(text).issues.map((i) => [i.code, i.line, i.column])).toEqual([
        ['encoding', 2, 7],
      ]);
    });

    it('shifts lines by lineOffset', () => {
      expect(parse('sweep: 1\na: "\\0"\n', 1).issues).toEqual([
        expect.objectContaining({ code: 'encoding', line: 3, column: 4 }),
      ]);
    });

    it.each([
      ['an escaped surrogate pair', '"\\ud83d\\ude00"'],
      ['an escaped astral code point', '"\\U0001F600"'],
      ['a literal emoji', '"\u{1F600}"'],
      ['backslash-zero in single quotes', "'\\0'"],
      ['backslash-zero in a plain scalar', 'a\\0b'],
    ])('accepts %s', (_name, value) => {
      expect(parse(`sweep: 1\na: ${value}\n`).issues).toEqual([]);
    });
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
