import { describe, expect, it } from 'vitest';
import { parseYaml, readFixture } from '../helpers.js';

const HEAD = ['sweep: 1', 'game: Tiny'].join('\n');
const SECTIONS = [
  'sections:',
  '  - id: start',
  '    title: Start',
  '    overview: The first area.',
  '  - id: cave',
  '    title: Cave',
  '    overview: The second area.',
].join('\n');

describe('checkReferences through parseGuide', () => {
  it('reports one id-duplicate for a section and a task sharing an ID, at the task', () => {
    const text = `${HEAD}
categories:
  loot:
    name: Loot
    about: Things.
${SECTIONS}
tasks:
  - id: cave
    title: Chest
    category: loot
    windows:
      - from: cave
`;
    const result = parseYaml(text);
    const dupes = result.issues.filter((i) => i.code === 'id-duplicate');
    expect(dupes).toHaveLength(1);
    expect(dupes[0]).toMatchObject({ path: 'tasks[0].id', line: 15 });
    expect(dupes[0]!.message).toContain('sections[1].id');
    expect(result.guide).toBeUndefined();
  });

  it('reports unknown-section at the entry of an any-of requires', () => {
    const result = parseYaml(`${HEAD}
sections:
  - id: start
    title: Start
    overview: The first area.
    requires: {any: [ghost]}
`);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'unknown-section',
        path: 'sections[0].requires.any[0]',
        line: 7,
        column: 22,
      }),
    );
  });

  it('does not flag until: end', () => {
    const result = parseYaml(`${HEAD}
categories:
  loot:
    name: Loot
    about: Things.
${SECTIONS}
tasks:
  - id: chest
    title: Chest
    category: loot
    windows:
      - from: start
        until: end
`);
    expect(result.issues).toEqual([]);
    expect(result.guide).toBeDefined();
  });

  it('accepts lantern-keep with no issues', () => {
    const result = parseYaml(readFixture('valid/lantern-keep.yaml'));
    expect(result.issues).toEqual([]);
    expect(result.guide).toBeDefined();
  });

  it('warns about an unused category and still returns the guide', () => {
    const result = parseYaml(`${HEAD}
categories:
  loot:
    name: Loot
    about: Things.
${SECTIONS}
`);
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'unused-category',
        path: 'categories.loot',
        line: 4,
        column: 3,
      }),
    ]);
    expect(result.guide).toBeDefined();
  });

  it('accepts a guide with no tasks and no categories', () => {
    const result = parseYaml(`${HEAD}\n${SECTIONS}\n`);
    expect(result.issues).toEqual([]);
    expect(result.guide).toBeDefined();
  });

  it('returns no guide for a non-blocking error but keeps checking', () => {
    const result = parseYaml(`${HEAD}
categories:
  loot:
    name: Loot
    about: Things.
${SECTIONS}
tasks:
  - id: chest
    title: Chest
    category: cards
    exclusive: only-one
    windows:
      - from: start
`);
    const codes = result.issues.map((i) => i.code).sort();
    expect(codes).toEqual(['exclusive-single', 'unknown-category', 'unused-category']);
    expect(result.guide).toBeUndefined();
  });
});
