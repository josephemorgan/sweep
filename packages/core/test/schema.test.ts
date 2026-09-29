import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { KNOWN_KEYS } from '../src/parse/schema.js';
import { guideJsonSchema } from '../src/parse/json-schema.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const validDir = join(here, 'fixtures', 'valid');
const schemaPath = join(here, '..', '..', '..', 'schema', 'sweep-guide.v1.schema.json');

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(guideJsonSchema());

const leaf = { id: 'a', title: 'A', overview: 'One.' };
const base = { sweep: 1, game: 'G', sections: [leaf] };

describe('guide JSON Schema', () => {
  it('matches the committed schema file', () => {
    const generated = JSON.stringify(guideJsonSchema(), null, 2) + '\n';
    expect(readFileSync(schemaPath, 'utf8'), 'schema drifted: run `pnpm schema`').toBe(generated);
  });

  const yamlFixtures = readdirSync(validDir).filter((f) => f.endsWith('.yaml'));
  it.each(yamlFixtures)('accepts fixtures/valid/%s', (name) => {
    const data: unknown = parse(readFileSync(join(validDir, name), 'utf8'));
    expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
  });

  it('accepts the lantern-keep.md front matter', () => {
    const path = join(validDir, 'lantern-keep.md');
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(path, 'utf8'));
    const data: unknown = parse(match?.[1] ?? '');
    expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
  });

  const loot = { loot: { name: 'Loot', about: 'Things.' } };
  const task = { id: 't', title: 'T', category: 'loot', windows: [{ from: 'a' }] };
  it.each([
    ['game: 1942', { ...base, game: 1942 }],
    ['title: true', { ...base, title: true }],
    [
      'numbers and booleans in section text',
      { ...base, sections: [{ ...leaf, title: 3.1, overview: false, walkthrough: 7 }] },
    ],
    [
      'numbers and booleans in task text',
      { ...base, categories: loot, tasks: [{ ...task, title: 42, how: true }] },
    ],
    [
      'numbers and booleans in category text',
      { ...base, categories: { loot: { name: 1, about: false } }, tasks: [task] },
    ],
  ])('accepts %s in plain-text fields, as the validator does', (_label, doc) => {
    expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
  });

  it('keeps the length bounds on the string branch of plain-text fields', () => {
    const properties = guideJsonSchema().properties as Record<string, unknown>;
    expect(properties.game).toEqual({
      anyOf: [
        { type: 'string', minLength: 1, maxLength: 120 },
        { type: 'number' },
        { type: 'boolean' },
      ],
    });
  });

  const nineWindows = Array.from({ length: 9 }, () => ({ from: 'a' }));
  it.each([
    ['sweep: 2', { ...base, sweep: 2 }],
    ['empty sections on a group', { ...base, sections: [{ ...leaf, sections: [] }] }],
    [
      'nine windows',
      {
        ...base,
        categories: { loot: { name: 'Loot', about: 'Things.' } },
        tasks: [{ id: 't', title: 'T', category: 'loot', windows: nineWindows }],
      },
    ],
    ['a bad ID', { ...base, sections: [{ ...leaf, id: 'Bad_ID' }] }],
    ['an unknown key', { ...base, sections: [{ ...leaf, titel: 'x' }] }],
    ['a bad category key', { ...base, categories: { Bad_Key: { name: 'B', about: 'b' } } }],
    ['from: null', { ...base, categories: loot, tasks: [{ ...task, windows: [{ from: null }] }] }],
    ['a numeric section ID', { ...base, sections: [{ ...leaf, id: 5 }] }],
    ['an empty game', { ...base, game: '' }],
  ])('rejects %s', (_label, doc) => {
    expect(validate(doc)).toBe(false);
  });

  it('exposes the known keys of each object', () => {
    expect(KNOWN_KEYS.section).toEqual([
      'id',
      'title',
      'overview',
      'walkthrough',
      'requires',
      'spoiler',
      'renamed_from',
      'sections',
    ]);
    expect(KNOWN_KEYS.window).toEqual(['from', 'until', 'home']);
    expect(KNOWN_KEYS.any).toEqual(['any']);
    expect(KNOWN_KEYS.guide).toContain('sweep');
    expect(KNOWN_KEYS.category).toEqual(['name', 'about', 'tracked']);
    expect(KNOWN_KEYS.task).toContain('windows');
  });
});
