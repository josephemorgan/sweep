import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ErrorCode, WarningCode } from '@sweep/core/parse';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(repoRoot + path, 'utf8');
const doc = read('docs/guide-format.md');

/** Backticked codes in the first column of the table under `## Validation` > `### <heading>`. */
function codesUnder(heading: string): string[] {
  const validation = doc.indexOf('\n## Validation\n');
  if (validation < 0) throw new Error('missing "## Validation" in docs/guide-format.md');
  const start = doc.indexOf(`\n### ${heading}\n`, validation);
  if (start < 0)
    throw new Error(`missing "### ${heading}" under "## Validation" in docs/guide-format.md`);
  const rest = doc.slice(start + heading.length + 6);
  const end = rest.search(/\n#{1,3} /);
  const section = end < 0 ? rest : rest.slice(0, end);
  return [...section.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]!);
}

/** Fenced blocks preceded by `<!-- file: … -->` or `<!-- from: … -->`. */
function markedBlocks(): { kind: 'file' | 'from'; path: string; body: string }[] {
  const re = /^<!-- (file|from): (\S+) -->\n(`{3,})[^\n]*\n([\s\S]*?)^\3\s*$/gm;
  return [...doc.matchAll(re)].map((m) => ({
    kind: m[1] as 'file' | 'from',
    path: m[2]!,
    body: m[4]!,
  }));
}

describe('docs/guide-format.md stays in sync with core (spec §9)', () => {
  it('lists exactly the error codes core defines', () => {
    expect(codesUnder('Errors').sort()).toEqual(Object.values(ErrorCode).sort());
  });

  it('lists exactly the warning codes core defines', () => {
    expect(codesUnder('Warnings').sort()).toEqual(Object.values(WarningCode).sort());
  });

  it('follows every embed marker directly with a fence', () => {
    const markers = doc.match(/^<!-- (file|from): /gm) ?? [];
    expect(markedBlocks().length).toBeGreaterThan(0);
    expect(markedBlocks().length, 'markers not directly followed by a fence').toBe(markers.length);
  });

  it('embeds example guides byte-for-byte', () => {
    for (const block of markedBlocks()) {
      const file = read(block.path);
      if (block.kind === 'file') expect(block.body, block.path).toBe(file);
      else expect(file.includes(block.body), `${block.path} contains the excerpt`).toBe(true);
    }
  });
});
