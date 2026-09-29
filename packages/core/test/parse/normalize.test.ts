import { describe, expect, it } from 'vitest';
import type { Section } from '../../src/model/guide.js';
import { normalize } from '../../src/parse/normalize.js';
import type { RawGuide } from '../../src/parse/schema.js';
import { parseYamlSource } from '../../src/parse/yaml.js';
import { parseGuide } from '../../src/parse/index.js';
import { loadGuide, parseOk, parseYaml, readFixture } from '../helpers.js';

const VALID = ['tiny-linear', 'botw-style', 'ff8-style', 'ff6-style', 'lantern-keep'];

describe.each(VALID)('valid fixture %s', (name) => {
  it('parses with no issues into the expected model', () => {
    const result = parseYaml(readFixture(`valid/${name}.yaml`));
    expect(result.issues).toEqual([]);
    expect(result.guide).toEqual(loadGuide(name));
  });
});

it('parses ff6-sample.yaml with no issues', () => {
  const result = parseYaml(readFixture('valid/ff6-sample.yaml'));
  expect(result.issues).toEqual([]);
  expect(result.guide).toBeDefined();
});

/** A guide with one category and the given `sections:` and `tasks:` blocks (already indented). */
function guideYaml(sections: string[], tasks: string[] = [], head: string[] = []): string {
  return [
    'sweep: 1',
    'game: Defaults',
    ...head,
    'categories:',
    '  loot:',
    '    name: Loot',
    '    about: Things to pick up.',
    'sections:',
    ...sections,
    ...(tasks.length > 0 ? ['tasks:', ...tasks] : []),
    '',
  ].join('\n');
}

function leaf(id: string, indent: string, extra: string[] = []): string[] {
  return [
    `${indent}- id: ${id}`,
    `${indent}  title: ${id}`,
    `${indent}  overview: Somewhere.`,
    ...extra.map((line) => `${indent}  ${line}`),
  ];
}

function group(id: string, children: string[], extra: string[] = []): string[] {
  return [...leaf(id, '  ', extra), '    sections:', ...children];
}

/** Every section in route order (depth-first). */
function flatten(sections: readonly Section[]): Section[] {
  return sections.flatMap((section) => [section, ...flatten(section.children)]);
}

function find(sections: readonly Section[], id: string): Section {
  const found = flatten(sections).find((section) => section.id === id);
  if (found === undefined) throw new Error(`no section ${id}`);
  return found;
}

describe('defaults', () => {
  it('title defaults to game', () => {
    const guide = parseOk(guideYaml(leaf('a', '  ')));
    expect(guide.title).toBe('Defaults');
  });

  it('a title that is given is kept', () => {
    const guide = parseOk(guideYaml(leaf('a', '  '), [], ['title: Checklist']));
    expect(guide.title).toBe('Checklist');
  });

  it('a leaf without requires follows the previous leaf in route order, across groups', () => {
    const guide = parseOk(
      guideYaml([
        ...group('g1', [...leaf('a', '      '), ...leaf('b', '      ')]),
        ...group('g2', leaf('c', '      ')),
      ]),
    );
    expect(find(guide.sections, 'a').requires).toEqual({ all: [] });
    expect(find(guide.sections, 'b').requires).toEqual({ all: ['a'] });
    expect(find(guide.sections, 'c').requires).toEqual({ all: ['b'] });
  });

  it('a group without requires has none', () => {
    const guide = parseOk(
      guideYaml([...group('g1', leaf('a', '      ')), ...group('g2', leaf('b', '      '))]),
    );
    expect(find(guide.sections, 'g1').requires).toEqual({ all: [] });
    expect(find(guide.sections, 'g2').requires).toEqual({ all: [] });
  });

  it('requires lists become all-of and any-of stays any-of', () => {
    const guide = parseOk(
      guideYaml([
        ...leaf('a', '  '),
        ...leaf('b', '  '),
        ...leaf('c', '  ', ['requires: [a]']),
        ...leaf('d', '  ', ['requires: {any: [a, b]}']),
      ]),
    );
    expect(find(guide.sections, 'c').requires).toEqual({ all: ['a'] });
    expect(find(guide.sections, 'd').requires).toEqual({ any: ['a', 'b'] });
  });

  it('renamed_from as a string becomes a one-item list, absent an empty list', () => {
    const guide = parseOk(
      guideYaml([...leaf('a', '  ', ['renamed_from: old']), ...leaf('b', '  ')]),
    );
    expect(find(guide.sections, 'a').renamedFrom).toEqual(['old']);
    expect(find(guide.sections, 'b').renamedFrom).toEqual([]);
  });

  it('how drops leading blank lines and trailing whitespace', () => {
    const guide = parseOk(
      guideYaml(leaf('a', '  '), [
        '  - id: chest',
        '    title: Chest',
        '    category: loot',
        '    how: "  \\n\\nText\\n\\n"',
        '    windows:',
        '      - from: a',
      ]),
    );
    expect(guide.tasks[0]!.how).toBe('Text');
  });

  it('a walkthrough that is only whitespace becomes null', () => {
    const guide = parseOk(guideYaml(leaf('a', '  ', ['walkthrough: "\\n"'])));
    expect(find(guide.sections, 'a').walkthrough).toBeNull();
  });

  it('a YAML block walkthrough loses its trailing newline and keeps inner indentation', () => {
    const guide = parseOk(
      guideYaml(
        leaf('a', '  ', ['walkthrough: |', '', '  First', '    indented', '', '  Last', '']),
      ),
    );
    expect(find(guide.sections, 'a').walkthrough).toBe('First\n  indented\n\nLast');
  });

  it('until defaults to from, and home to the first leaf of a group from', () => {
    const guide = parseOk(
      guideYaml(
        [...leaf('a', '  '), ...group('g', [...leaf('b', '      '), ...leaf('c', '      ')])],
        [
          '  - id: chest',
          '    title: Chest',
          '    category: loot',
          '    windows:',
          '      - from: a',
          '      - from: g',
          '        until: end',
        ],
      ),
    );
    expect(guide.tasks[0]!.windows).toEqual([
      { from: 'a', until: 'a', home: 'a' },
      { from: 'g', until: 'end', home: 'b' },
    ]);
  });

  it('home defaults to the first leaf of a nested group', () => {
    const inner = [
      '      - id: h',
      '        title: h',
      '        overview: Somewhere.',
      '        sections:',
      ...leaf('b', '          '),
    ];
    const guide = parseOk(
      guideYaml(group('g', inner), [
        '  - id: chest',
        '    title: Chest',
        '    category: loot',
        '    windows:',
        '      - from: g',
      ]),
    );
    expect(guide.tasks[0]!.windows[0]!.home).toBe('b');
  });

  it('spoiler defaults to false, a leaf has no children, tracked to true, tasks to []', () => {
    const guide = parseOk(guideYaml(leaf('a', '  ')));
    expect(find(guide.sections, 'a').spoiler).toBe(false);
    expect(find(guide.sections, 'a').children).toEqual([]);
    expect(guide.categories).toEqual([
      { id: 'loot', name: 'Loot', about: 'Things to pick up.', tracked: true },
    ]);
    expect(guide.tasks).toEqual([]);
  });
});

describe('source map', () => {
  it('maps each section and task ID to its YAML path', () => {
    const text = readFixture('valid/lantern-keep.yaml');
    const { sources } = normalize(rawOf(text), new Map());
    expect(sources.sections.get('act-2')).toEqual(['sections', 1]);
    expect(sources.sections.get('west-tower')).toEqual(['sections', 1, 'sections', 2]);
    expect(sources.tasks.get('lost-cat')).toEqual(['tasks', 2]);
  });
});

describe('body walkthroughs', () => {
  it('fill a section walkthrough from the Markdown body map, trimmed', () => {
    const raw = rawOf(guideYaml(leaf('a', '  ')));
    const { guide } = normalize(raw, new Map([['a', '\n## Heading\nBody.\n\n']]));
    expect(guide.sections[0]!.walkthrough).toBe('## Heading\nBody.');
  });
});

describe('line endings', () => {
  it('CRLF with a BOM normalizes like LF', () => {
    const text = readFixture('valid/lantern-keep.yaml');
    const crlf = parseGuide({ 'guide.yaml': '﻿' + text.replaceAll('\n', '\r\n') });
    expect(crlf.issues).toEqual([]);
    expect(crlf.guide).toEqual(parseOk(text));
  });
});

describe('.md guides', () => {
  it('normalize from the front matter alone for now', () => {
    const text = readFixture('valid/tiny-linear.yaml');
    const result = parseGuide({ 'guide.md': `---\n${text}---\n` });
    expect(result.issues).toEqual([]);
    expect(result.guide).toEqual(loadGuide('tiny-linear'));
  });
});

/** The raw guide object for `text`, which must be valid YAML. */
function rawOf(text: string): RawGuide {
  const { parsed, issues } = parseYamlSource(text, 'guide.yaml', 0);
  expect(issues).toEqual([]);
  return parsed!.value as RawGuide;
}
