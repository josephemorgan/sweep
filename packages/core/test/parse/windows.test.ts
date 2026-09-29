import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGuide } from '../../src/parse/index.js';
import { FIXTURES, parseYaml, readFixture } from '../helpers.js';

const HEAD = [
  'sweep: 1',
  'game: Windows',
  'categories:',
  '  loot:',
  '    name: Loot',
  '    about: x',
];

/** Four leaves (a, b, c, d) and one task whose windows are the given YAML lines. */
function guideWith(windows: string[]): string {
  const sections = ['a', 'b', 'c', 'd']
    .map((id) => `  - id: ${id}\n    title: ${id}\n    overview: Somewhere.\n`)
    .join('');
  const lines = windows.map((w) => `      ${w}`).join('\n');
  return `${HEAD.join('\n')}\nsections:\n${sections}tasks:\n  - id: t\n    title: T\n    category: loot\n    windows:\n${lines}\n`;
}

const windowCodes = (windows: string[]): string[] =>
  parseYaml(guideWith(windows))
    .issues.filter((i) => i.severity === 'error')
    .map((i) => i.code);

describe('window checks', () => {
  it('accepts a window with an explicit home and until end', () => {
    expect(windowCodes(['- from: b', '  until: end', '  home: c'])).toEqual([]);
  });

  it('accepts a home equal to the last leaf of until (bounds are inclusive)', () => {
    expect(windowCodes(['- from: a', '  until: c', '  home: c'])).toEqual([]);
    expect(windowCodes(['- from: a', '  until: c', '  home: a'])).toEqual([]);
  });

  it('accepts ordered, disjoint windows, the last ending at end', () => {
    expect(windowCodes(['- from: a', '  until: b', '- from: c', '  until: end'])).toEqual([]);
  });

  it('reports until-before-from and skips home-outside-window for that window', () => {
    expect(windowCodes(['- from: c', '  until: a', '  home: d'])).toEqual(['until-before-from']);
  });

  it('reports window-order for a second window that overlaps the first', () => {
    expect(windowCodes(['- from: a', '  until: c', '- from: c', '  until: d'])).toEqual([
      'window-order',
    ]);
  });

  it('reports end-not-last without also reporting window-order', () => {
    const codes = windowCodes(['- from: a', '  until: end', '- from: b', '  until: c']);
    expect(codes).toEqual(['end-not-last']);
  });

  it('checks every window, not only the first', () => {
    const codes = windowCodes(['- from: a', '  until: a', '- from: c', '  until: d', '  home: b']);
    expect(codes).toEqual(['home-outside-window']);
  });

  it('runs even when the requires graph has errors', () => {
    const text = guideWith(['- from: c', '  until: a']).replace(
      '  - id: a\n',
      '  - id: a\n    requires: [a]\n',
    );
    const codes = parseYaml(text).issues.map((i) => i.code);
    expect(codes).toContain('requires-lineage');
    expect(codes).toContain('until-before-from');
  });

  it.each([
    ['home-not-leaf', 'home-not-leaf'],
    ['home-outside-window', 'home-outside-window'],
    ['home-outside-window-before', 'home-outside-window'],
    ['until-before-from', 'until-before-from'],
    ['window-order', 'window-order'],
    ['window-order-overlap', 'window-order'],
    ['end-not-last', 'end-not-last'],
  ])('fixture %s produces exactly one error, %s', (name, code) => {
    const result = parseGuide({ 'guide.yaml': readFixture(`invalid/${name}.yaml`) });
    expect(result.issues.map((i) => [i.severity, i.code])).toEqual([['error', code]]);
  });

  it('accepts every valid fixture', () => {
    for (const name of readdirSync(new URL('valid/', FIXTURES))) {
      if (!name.endsWith('.yaml')) continue;
      const result = parseGuide({ 'guide.yaml': readFixture(`valid/${name}`) });
      expect(
        result.issues.filter((i) => i.severity === 'error'),
        name,
      ).toEqual([]);
    }
  });
});
