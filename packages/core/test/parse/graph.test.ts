import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGuide } from '../../src/parse/index.js';
import { FIXTURES, parseYaml, readFixture } from '../helpers.js';

const HEAD = ['sweep: 1', 'game: Graph'].join('\n');

/** A guide of leaf sections. Each entry is `id` or `id=<requires as YAML flow>`. */
function guideWith(sections: string[]): string {
  const body = sections
    .map((s) => {
      const [id, requires] = s.split('=');
      const req = requires === undefined ? '' : `    requires: ${requires}\n`;
      return `  - id: ${id}\n    title: ${id}\n${req}    overview: Somewhere.\n`;
    })
    .join('');
  return `${HEAD}\nsections:\n${body}`;
}

const graphIssues = (text: string) =>
  parseYaml(text).issues.filter(
    (i) => i.code === 'requires-cycle' || i.code === 'requires-lineage',
  );

describe('requires graph', () => {
  it('accepts a diamond', () => {
    const text = guideWith(['a', 'b=[a]', 'c=[a]', 'd=[b, c]']);
    expect(parseYaml(text).issues).toEqual([]);
  });

  it('accepts a forward reference that is not a cycle', () => {
    expect(graphIssues(guideWith(['a=[c]', 'b=[c]', 'c=[]']))).toEqual([]);
  });

  it('reports one requires-cycle per cycle, following what each section needs', () => {
    // a needs c, c needs b, b needs a.
    const text = guideWith(['a=[c]', 'b=[a]', 'c=[b]', 'd=[]', 'e=[f]', 'f=[e]']);
    const issues = graphIssues(text);
    expect(issues.map((i) => i.message)).toEqual([
      'requires cycle: a → c → b → a',
      'requires cycle: e → f → e',
    ]);
  });

  it('locates a cycle at the first explicit requires on it, in route order', () => {
    const [found] = graphIssues(guideWith(['a', 'b=[c]', 'c=[b]']));
    expect(found).toMatchObject({ line: 9, column: 15, path: 'sections[1].requires' });
  });

  it("never locates a cycle at a group's requires: [], which has no edge into it", () => {
    const text = [
      'sweep: 1',
      'game: Graph',
      'sections:',
      '  - id: g',
      '    title: G',
      '    overview: A group.',
      '    requires: []',
      '    sections:',
      '      - id: g1',
      '        title: G1',
      '        overview: One.',
      '        requires: [x]',
      '      - id: g2',
      '        title: G2',
      '        overview: Two.',
      '  - id: x',
      '    title: X',
      '    overview: Beyond.',
      '    requires: [g]',
      '',
    ].join('\n');
    expect(graphIssues(text)).toEqual([
      expect.objectContaining({
        message: 'requires cycle: g1 → x → g → g1',
        line: 12,
        column: 19,
        path: 'sections[0].sections[0].requires',
      }),
    ]);
  });

  it('reports a self-requiring section as lineage, not a cycle', () => {
    const issues = graphIssues(guideWith(['a=[a]']));
    expect(issues.map((i) => i.code)).toEqual(['requires-lineage']);
  });

  it('skips the cycle check when there is any lineage error', () => {
    const text = guideWith(['a=[a]', 'b=[c]', 'c=[b]']);
    expect(graphIssues(text).map((i) => i.code)).toEqual(['requires-lineage']);
  });

  it('locates lineage at the ID inside an any-of', () => {
    const [found] = graphIssues(guideWith(['a', 'b={any: [a, b]}']));
    expect(found).toMatchObject({ code: 'requires-lineage', path: 'sections[1].requires.any[1]' });
  });

  it('survives a 1500-section chain closed into one cycle', () => {
    const ids = Array.from({ length: 1500 }, (_, i) => `s${i}`);
    const text = guideWith(ids.map((id, i) => (i === 0 ? `${id}=[s1499]` : id)));
    const issues = graphIssues(text);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('requires-cycle');
  });

  it.each([
    ['requires-lineage-self', 'requires-lineage'],
    ['requires-lineage-ancestor', 'requires-lineage'],
    ['requires-lineage-descendant', 'requires-lineage'],
    ['requires-cycle', 'requires-cycle'],
    ['requires-cycle-default', 'requires-cycle'],
    ['requires-cycle-any', 'requires-cycle'],
    ['requires-cycle-group', 'requires-cycle'],
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
