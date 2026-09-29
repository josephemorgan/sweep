import { describe, expect, it } from 'vitest';
import {
  parseGuide,
  type ErrorCode,
  type GuideFiles,
  type WarningCode,
} from '../../src/parse/index.js';
import { readFixture } from '../helpers.js';

interface InvalidCase {
  name: string;
  /** A fixture under fixtures/invalid/, or inline files for byte-level cases. */
  fixture?: string;
  files?: GuideFiles;
  code: ErrorCode;
  line: number | null;
  column: number | null;
  path?: string | null;
}

function fixtureVirtualName(fixture: string): string {
  return fixture.endsWith('.md') ? 'guide.md' : 'guide.yaml';
}

/** A guide with `count` top-level leaf sections, 3 lines each after a 3-line header. */
function manySections(count: number): string {
  const sections = Array.from(
    { length: count },
    (_, i) => `  - id: s${i}\n    title: S\n    overview: Somewhere.\n`,
  );
  return `sweep: 1\ngame: Many\nsections:\n${sections.join('')}`;
}

// Rows are appended by the tasks that implement each error code.
const CASES: InvalidCase[] = [
  { name: 'no root file', files: {}, code: 'no-root-file', line: null, column: null },
  {
    name: 'file over 2 MiB',
    files: { 'guide.yaml': new Uint8Array(2 * 1024 * 1024 + 1).fill(0x61) },
    code: 'too-large',
    line: null,
    column: null,
  },
  {
    name: 'invalid UTF-8 bytes',
    files: { 'guide.yaml': new Uint8Array([0x73, 0x77, 0x0a, 0xc3, 0x28]) },
    code: 'encoding',
    line: 2,
    column: 1,
  },
  {
    name: 'markdown without front matter',
    fixture: 'md-front-matter.md',
    code: 'md-front-matter',
    line: 1,
    column: 1,
  },
  {
    name: 'markdown with unclosed front matter',
    fixture: 'md-front-matter-unclosed.md',
    code: 'md-front-matter',
    line: 1,
    column: 1,
  },
  {
    name: 'YAML parse error',
    fixture: 'yaml-syntax.yaml',
    code: 'yaml-syntax',
    line: 13,
    column: 12,
  },
  {
    name: 'YAML parse error in markdown front matter',
    fixture: 'yaml-syntax-md.md',
    code: 'yaml-syntax',
    line: 14,
    column: 12,
  },
  {
    name: 'duplicate YAML key',
    fixture: 'yaml-syntax-duplicate-key.yaml',
    code: 'yaml-syntax',
    line: 17,
    column: 5,
    path: 'sections[2].title',
  },
  {
    name: 'custom YAML tag',
    fixture: 'yaml-syntax-tag.yaml',
    code: 'yaml-syntax',
    line: 3,
    column: 14,
    path: 'game',
  },
  {
    name: 'multiple YAML documents',
    fixture: 'yaml-syntax-multi-doc.yaml',
    code: 'yaml-syntax',
    line: 28,
    column: 1,
  },
  {
    name: 'over 100 alias expansions',
    fixture: 'yaml-syntax-aliases.yaml',
    code: 'yaml-syntax',
    line: 28,
    column: 9,
    path: 'notes[0]',
  },
  {
    name: 'duplicate category key',
    fixture: 'id-duplicate-category.yaml',
    code: 'id-duplicate',
    line: 8,
    column: 3,
    path: 'categories.loot',
  },
  {
    name: 'unsupported format version',
    fixture: 'format-version.yaml',
    code: 'format-version',
    line: 2,
    column: 8,
    path: 'sweep',
  },
  {
    name: 'missing format version',
    fixture: 'format-version-missing.yaml',
    code: 'format-version',
    line: 2,
    column: 1,
    path: 'sweep',
  },
  {
    name: 'missing required key',
    fixture: 'required.yaml',
    code: 'required',
    line: 22,
    column: 5,
    path: 'tasks[0].windows',
  },
  {
    name: 'empty plain-text field',
    fixture: 'required-empty.yaml',
    code: 'required',
    line: 13,
    column: 12,
    path: 'sections[1].title',
  },
  {
    name: 'wrong type',
    fixture: 'type.yaml',
    code: 'type',
    line: 18,
    column: 14,
    path: 'sections[2].spoiler',
  },
  {
    name: 'empty group sections',
    fixture: 'type-empty-sections.yaml',
    code: 'type',
    line: 18,
    column: 15,
    path: 'sections[2].sections',
  },
  {
    name: 'unsupported requires shape',
    fixture: 'type-requires-shape.yaml',
    code: 'type',
    line: 15,
    column: 15,
    path: 'sections[1].requires',
  },
  {
    name: 'section ID not a slug',
    fixture: 'id-format.yaml',
    code: 'id-format',
    line: 12,
    column: 9,
    path: 'sections[1].id',
  },
  {
    name: 'category key not a slug',
    fixture: 'id-format-category-key.yaml',
    code: 'id-format',
    line: 5,
    column: 3,
    path: 'categories.Loot',
  },
  {
    name: 'empty top-level sections',
    fixture: 'no-leaves.yaml',
    code: 'no-leaves',
    line: 8,
    column: 11,
    path: 'sections',
  },
  {
    name: 'title over 120 characters',
    fixture: 'limit-title.yaml',
    code: 'limit',
    line: 13,
    column: 12,
    path: 'sections[1].title',
  },
  {
    name: 'more than 8 windows',
    fixture: 'limit-windows.yaml',
    code: 'limit',
    line: 26,
    column: 7,
    path: 'tasks[0].windows',
  },
  {
    name: 'nesting deeper than 5 levels',
    fixture: 'limit-depth.yaml',
    code: 'limit',
    line: 35,
    column: 29,
    path: 'sections[2].sections[0].sections[0].sections[0].sections[0].sections[0].id',
  },
  {
    name: 'structure error in markdown front matter',
    files: { 'guide.md': '---\nsweep: 1\ngame: Tiny\nsections: []\n---\n' },
    code: 'no-leaves',
    line: 4,
    column: 11,
    path: 'sections',
  },
  {
    name: 'more than 2,000 sections',
    files: { 'guide.yaml': manySections(2001) },
    code: 'limit',
    line: 3 + 3 * 2000 + 1,
    column: 5,
    path: 'sections[2000]',
  },
];

describe.each(CASES)('$name', (c) => {
  it(`reports ${c.code} at ${c.line}:${c.column}`, () => {
    const files =
      c.files ??
      ({ [fixtureVirtualName(c.fixture!)]: readFixture(`invalid/${c.fixture}`) } as GuideFiles);
    const result = parseGuide(files);
    expect(result.guide).toBeUndefined();
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: c.code,
        line: c.line,
        column: c.column,
        ...(c.path !== undefined ? { path: c.path } : {}),
      }),
    );
  });
});

interface WarningCase {
  name: string;
  files: GuideFiles;
  code: WarningCode;
  line: number;
  column: number;
  path?: string | null;
}

/** tiny-linear.yaml with one edit, so each warning row is otherwise a valid guide. */
function tinyLinearWith(search: string, replacement: string): GuideFiles {
  const text = readFixture('valid/tiny-linear.yaml');
  if (!text.includes(search)) throw new Error(`tiny-linear.yaml has no ${search}`);
  return { 'guide.yaml': text.replace(search, replacement) };
}

// Rows are appended by the tasks that implement each warning code.
const WARNING_CASES: WarningCase[] = [
  {
    name: 'unknown key in a section',
    files: tinyLinearWith('    title: Forest\n', '    title: Forest\n    colour: green\n'),
    code: 'unknown-key',
    line: 13,
    column: 5,
    path: 'sections[1].colour',
  },
  {
    name: 'overview over 200 characters',
    files: tinyLinearWith('overview: The second area.', `overview: ${'a'.repeat(201)}`),
    code: 'overview-long',
    line: 13,
    column: 15,
    path: 'sections[1].overview',
  },
];

describe.each(WARNING_CASES)('$name', (c) => {
  it(`warns ${c.code} at ${c.line}:${c.column}`, () => {
    const result = parseGuide(c.files);
    expect(result.guide).toBeDefined();
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: c.code,
        line: c.line,
        column: c.column,
        ...(c.path !== undefined ? { path: c.path } : {}),
      }),
    );
  });
});
