import { describe, expect, it } from 'vitest';
import type { Issue } from '../../src/model/issue.js';
import { checkStructure } from '../../src/parse/structure.js';
import { parseYamlSource } from '../../src/parse/yaml.js';
import { readFixture } from '../helpers.js';

function check(text: string): ReturnType<typeof checkStructure> {
  const { parsed, issues } = parseYamlSource(text, 'guide.yaml', 0);
  expect(issues).toEqual([]);
  return checkStructure(parsed!.value, 'guide.yaml', parsed!.locator);
}

/** The single issue with `code`, failing when there are none or several. */
function only(issues: Issue[], code: string): Issue {
  const found = issues.filter((i) => i.code === code);
  expect(found, JSON.stringify(issues)).toHaveLength(1);
  return found[0]!;
}

const BASE = [
  'sweep: 1', //                     1
  'game: Tiny', //                   2
  'categories:', //                  3
  '  loot:', //                      4
  '    name: Loot', //               5
  '    about: Things to pick up.', // 6
  'sections:', //                    7
  '  - id: start', //                8
  '    title: Start', //             9
  '    overview: The first area.', // 10
  'tasks:', //                       11
  '  - id: chest', //                12
  '    title: Chest', //             13
  '    category: loot', //           14
  '    windows:', //                 15
  '      - from: start', //          16
  '',
].join('\n');

/** BASE with extra lines added to the `start` section, after its overview (line 11 onwards). */
function withSection(...lines: string[]): string {
  return BASE.replace('first area.\n', `first area.\n${lines.map((l) => `    ${l}\n`).join('')}`);
}

describe('checkStructure', () => {
  it.each(['tiny-linear', 'botw-style', 'ff6-style', 'ff6-sample', 'ff8-style', 'lantern-keep'])(
    'accepts the valid fixture %s and returns the raw guide',
    (name) => {
      const text = readFixture(`valid/${name}.yaml`);
      const { parsed } = parseYamlSource(text, 'guide.yaml', 0);
      const { raw, issues } = checkStructure(parsed!.value, 'guide.yaml', parsed!.locator);
      expect(issues).toEqual([]);
      expect(raw).toEqual(parsed!.value);
    },
  );

  describe('scalars in plain-text fields', () => {
    it('keeps the source text of numbers and booleans', () => {
      const text = BASE.replace('game: Tiny', 'game: 1942')
        .replace('title: Start', 'title: 3.10')
        .replace('name: Loot', 'name: true');
      const { raw, issues } = check(text);
      expect(issues).toEqual([]);
      expect(raw?.game).toBe('1942');
      expect(raw?.sections[0]?.title).toBe('3.10');
      expect(raw?.categories?.loot?.name).toBe('true');
    });

    it('does not coerce booleans in boolean fields', () => {
      const { raw, issues } = check(withSection('spoiler: "yes"'));
      expect(raw).toBeUndefined();
      expect(only(issues, 'type')).toMatchObject({
        severity: 'error',
        line: 11,
        column: 14,
        path: 'sections[0].spoiler',
      });
      expect(only(issues, 'type').message).toContain('true or false');
    });
  });

  describe('unknown keys', () => {
    it('suggests the closest known key', () => {
      const { issues } = check(BASE.replace('title: Start', 'titel: Start'));
      const warning = only(issues, 'unknown-key');
      expect(warning).toMatchObject({
        severity: 'warning',
        line: 9,
        column: 5,
        path: 'sections[0].titel',
      });
      expect(warning.message).toContain('did you mean `title`');
    });

    it('lists the known keys when nothing is close', () => {
      const { raw, issues } = check(withSection('zzzzzz: 1'));
      expect(raw).toBeDefined();
      const warning = only(issues, 'unknown-key');
      expect(warning).toMatchObject({ severity: 'warning', line: 11, column: 5 });
      expect(warning.message).toContain(
        'known keys: id, title, overview, walkthrough, requires, spoiler, renamed_from, sections',
      );
    });
  });

  describe('overview', () => {
    const overview = (text: string): string =>
      BASE.replace('overview: The first area.', `overview: ${text}`);

    it('warns above 200 characters', () => {
      const { raw, issues } = check(overview('a'.repeat(201)));
      expect(raw).toBeDefined();
      expect(only(issues, 'overview-long')).toMatchObject({
        severity: 'warning',
        line: 10,
        column: 15,
        path: 'sections[0].overview',
      });
    });

    it('warns about a line break', () => {
      expect(only(check(overview('"a\\nb"')).issues, 'overview-long').severity).toBe('warning');
    });

    it('accepts 200 characters', () => {
      expect(check(overview('a'.repeat(200))).issues).toEqual([]);
    });

    it('rejects more than 500 characters with limit only', () => {
      const { raw, issues } = check(overview('a'.repeat(501)));
      expect(raw).toBeUndefined();
      expect(issues.map((i) => i.code)).toEqual(['limit']);
      expect(issues[0]).toMatchObject({ severity: 'error', line: 10, column: 15 });
      expect(issues[0]!.message).toContain('500');
    });
  });

  describe('requires and renamed_from', () => {
    it('rejects a list mixed with {any: ...} as type', () => {
      const { issues } = check(withSection('requires: [{any: [start]}]'));
      expect(issues).toHaveLength(1);
      expect(only(issues, 'type')).toMatchObject({
        line: 11,
        column: 15,
        path: 'sections[0].requires',
      });
    });

    it.each([
      ['a string', 'requires: start'],
      ['an any that is not a list', 'requires: {any: start}'],
      ['a mapping without any', 'requires: {all: [start]}'],
    ])('rejects %s as one type issue', (_, line) => {
      const { issues } = check(withSection(line));
      expect(issues.map((i) => i.code)).toEqual(['type']);
    });

    it('warns about an unknown key next to any', () => {
      const { raw, issues } = check(withSection('requires: {any: [start], all: [start]}'));
      expect(raw).toBeDefined();
      expect(only(issues, 'unknown-key')).toMatchObject({
        severity: 'warning',
        line: 11,
        column: 30,
        path: 'sections[0].requires.all',
      });
      expect(only(issues, 'unknown-key').message).toContain('did you mean `any`');
    });

    it('rejects a bad ID inside any as id-format', () => {
      const { issues } = check(withSection('requires: {any: [Bad]}'));
      expect(only(issues, 'id-format')).toMatchObject({
        line: 11,
        column: 22,
        path: 'sections[0].requires.any[0]',
      });
    });

    it('rejects a bad renamed_from slug as id-format', () => {
      const { issues } = check(withSection('renamed_from: Bad'));
      expect(issues.map((i) => i.code)).toEqual(['id-format']);
      expect(issues[0]).toMatchObject({ path: 'sections[0].renamed_from' });
    });

    it('rejects a number in renamed_from as type', () => {
      const { issues } = check(withSection('renamed_from: 3'));
      expect(issues.map((i) => i.code)).toEqual(['type']);
    });

    it('reports a slug over 64 characters once, as id-format', () => {
      const { issues } = check(withSection(`requires: [${'a'.repeat(65)}B]`));
      expect(issues.map((i) => i.code)).toEqual(['id-format']);
    });

    it('rejects more than 50 requires IDs as limit', () => {
      const ids = Array.from({ length: 51 }, (_, i) => `s${i}`).join(', ');
      const { issues } = check(withSection(`requires: [${ids}]`));
      expect(issues.map((i) => i.code)).toEqual(['limit']);
      expect(issues[0]!.message).toContain('50');
    });
  });

  describe('required', () => {
    it('points a missing key at the mapping that lacks it', () => {
      const text = BASE.replace('    windows:\n      - from: start\n', '');
      const { raw, issues } = check(text);
      expect(raw).toBeUndefined();
      const error = only(issues, 'required');
      expect(error).toMatchObject({ line: 12, column: 5, path: 'tasks[0].windows' });
      expect(error.message).toContain('windows');
    });

    it('rejects an empty plain-text field at its value', () => {
      const { issues } = check(BASE.replace('title: Start', 'title: ""'));
      expect(only(issues, 'required')).toMatchObject({
        line: 9,
        column: 12,
        path: 'sections[0].title',
      });
    });
  });

  describe('sections', () => {
    it('rejects an empty top-level sections list as no-leaves', () => {
      const text = BASE.replace(/sections:\n(?: {2,}.*\n)+/, 'sections: []\n');
      const { issues } = check(text);
      expect(issues.map((i) => i.code)).toEqual(['no-leaves']);
      expect(issues[0]).toMatchObject({ line: 7, column: 11, path: 'sections' });
    });

    it('rejects an empty group sections list as type', () => {
      const { issues } = check(withSection('sections: []'));
      expect(issues.map((i) => i.code)).toEqual(['type']);
      expect(issues[0]).toMatchObject({ line: 11, column: 15, path: 'sections[0].sections' });
    });

    it('allows 5 levels of nesting and rejects the 6th at its id', () => {
      const nest = (depth: number): string => {
        const lines: string[] = [];
        for (let d = 2; d <= depth; d++) {
          const pad = '  '.repeat(2 * (d - 2));
          lines.push(`${pad}sections:`, `${pad}  - id: d${d}`);
          lines.push(`${pad}    title: D`, `${pad}    overview: Deeper.`);
        }
        return withSection(...lines);
      };
      expect(check(nest(5)).issues).toEqual([]);
      const { issues } = check(nest(7));
      expect(issues.map((i) => i.code)).toEqual(['limit']);
      expect(issues[0]).toMatchObject({
        line: 28,
        column: 29,
        path: 'sections[0].sections[0].sections[0].sections[0].sections[0].sections[0].id',
      });
    });
  });

  describe('counts', () => {
    it('rejects more than 50 categories at the 51st key', () => {
      const categories = Array.from(
        { length: 51 },
        (_, i) => `  c${i}:\n    name: C\n    about: A.\n`,
      ).join('');
      const text = BASE.replace(
        '  loot:\n    name: Loot\n    about: Things to pick up.\n',
        categories,
      ).replace('category: loot', 'category: c0');
      const { issues } = check(text);
      expect(issues.map((i) => i.code)).toEqual(['limit']);
      expect(issues[0]).toMatchObject({ line: 4 + 150, column: 3, path: 'categories.c50' });
    });

    it('rejects more than 10,000 tasks at the 10,001st', () => {
      const tasks = Array.from(
        { length: 10_001 },
        (_, i) => `  - {id: t${i}, title: T, category: loot, windows: [{from: start}]}\n`,
      ).join('');
      const text = BASE.replace(/tasks:\n[^]*$/, `tasks:\n${tasks}`);
      const { issues } = check(text);
      expect(issues.map((i) => i.code)).toEqual(['limit']);
      expect(issues[0]).toMatchObject({ line: 12 + 10_000, column: 5, path: 'tasks[10000]' });
      expect(issues[0]!.message).toContain('10,000');
    });
  });

  describe('unknown-key hints', () => {
    it.each(['requires', 'any'])('uses the category keys for a category named %s', (id) => {
      const text = BASE.replace(
        '  loot:\n',
        `  ${id}:\n    name: R\n    about: A\n    nmae: x\n  loot:\n`,
      );
      const warning = only(check(text).issues, 'unknown-key');
      expect(warning.path).toBe(`categories.${id}.nmae`);
      expect(warning.message).toBe('unknown key `nmae` is ignored; did you mean `name`?');
    });

    it.each(['foo', '3', '<<'])(
      'does not suggest a key for %s, which is no closer than its length',
      (key) => {
        const warning = only(check(withSection(`${key}: 1`)).issues, 'unknown-key');
        expect(warning.message).toBe(
          `unknown key \`${key}\` is ignored; known keys: id, title, overview, walkthrough, ` +
            'requires, spoiler, renamed_from, sections',
        );
      },
    );
  });

  describe('booleans and nulls in ID and reference fields', () => {
    it.each([
      [
        'from: null',
        BASE.replace('from: start', 'from: null'),
        'tasks[0].windows[0].from',
        16,
        15,
        '`from` must be a string; YAML read `null` as null, so quote it: from: "null"',
      ],
      [
        'id: true',
        BASE.replace('id: start', 'id: true'),
        'sections[0].id',
        8,
        9,
        '`id` must be a string; YAML read `true` as boolean, so quote it: id: "true"',
      ],
      [
        'category: ~',
        BASE.replace('category: loot', 'category: ~'),
        'tasks[0].category',
        14,
        15,
        '`category` must be a string; YAML read `~` as null, so quote it: category: "~"',
      ],
      [
        'exclusive: False',
        BASE.replace('category: loot', 'category: loot\n    exclusive: False'),
        'tasks[0].exclusive',
        15,
        16,
        '`exclusive` must be a string; YAML read `False` as boolean, so quote it: exclusive: "False"',
      ],
      [
        'requires: [false]',
        withSection('requires: [false]'),
        'sections[0].requires[0]',
        11,
        16,
        '`requires[0]` must be a string; YAML read `false` as boolean, so quote it: "false"',
      ],
      [
        'requires: {any: [start, null]}',
        withSection('requires: {any: [start, null]}'),
        'sections[0].requires.any[1]',
        11,
        29,
        '`any[1]` must be a string; YAML read `null` as null, so quote it: "null"',
      ],
      [
        'renamed_from: true',
        withSection('renamed_from: true'),
        'sections[0].renamed_from',
        11,
        19,
        '`renamed_from` must be a string; YAML read `true` as boolean, so quote it: renamed_from: "true"',
      ],
      [
        'from: (empty)',
        BASE.replace('from: start', 'from:'),
        'tasks[0].windows[0].from',
        16,
        14,
        '`from` is empty; give it a section ID',
      ],
      [
        'a requires entry left empty',
        withSection('requires:', '  -'),
        'sections[0].requires[0]',
        12,
        8,
        '`requires[0]` is empty; give it a section ID',
      ],
    ])('%s is a type error that says to quote it', (_name, text, path, line, column, message) => {
      const { raw, issues } = check(text);
      expect(raw).toBeUndefined();
      expect(issues.filter((i) => i.severity === 'error')).toEqual([
        expect.objectContaining({ code: 'type', path, line, column, message }),
      ]);
    });
  });

  describe('category keys', () => {
    it('rejects a __proto__ key at the key, and a non-mapping value, independent of Zod', () => {
      const { raw, issues } = check(BASE.replace('  loot:\n', '  __proto__: 5\n  loot:\n'));
      expect(raw).toBeUndefined();
      expect(only(issues, 'id-format')).toMatchObject({
        line: 4,
        column: 3,
        path: 'categories.__proto__',
        message: `category ID \`__proto__\` must be a slug (lowercase letters and digits in words joined by single hyphens, starting with a letter, at most 64 characters, like forest-chest)`,
      });
      expect(only(issues, 'type')).toMatchObject({
        line: 4,
        column: 14,
        path: 'categories.__proto__',
      });
    });
  });

  it('drops schema issues on sweep', () => {
    const { parsed } = parseYamlSource(BASE, 'guide.yaml', 0);
    const value = { ...(parsed!.value as object), sweep: 2 };
    const { raw, issues } = checkStructure(value, 'guide.yaml', parsed!.locator);
    expect(issues).toEqual([]);
    expect(raw).toBeDefined();
  });
});
