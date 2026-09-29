import { describe, expect, it } from 'vitest';
import { parseGuide, type ErrorCode, type GuideFiles } from '../../src/parse/index.js';
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
