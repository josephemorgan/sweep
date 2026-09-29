import { describe, expect, it } from 'vitest';
import { diffGuides } from '../../src/diff/diff-guides.js';
import { parseOk } from '../helpers.js';

const LOOT = `categories:
  loot:
    name: Loot
    about: Stuff.
`;

function guide(body: string, categories: string = LOOT): ReturnType<typeof parseOk> {
  return parseOk(`sweep: 1\ngame: X\n${categories}\n${body}`);
}

/** A linear guide of leaves (the default requires chain them in order). */
function linear(ids: string[], titles: Record<string, string> = {}): string {
  return (
    'sections:\n' +
    ids.map((id) => `  - { id: ${id}, title: ${titles[id] ?? id}, overview: o }\n`).join('')
  );
}

/** Sets `renamedFrom` on a parsed section, bypassing the parser's rename-conflict errors. */
function withRenamed(g: ReturnType<typeof parseOk>, renamed: Record<string, string[]>): typeof g {
  const copy = structuredClone(g);
  for (const s of copy.sections) if (s.id in renamed) s.renamedFrom = renamed[s.id]!;
  return copy;
}

const BASE = guide(
  linear(['a', 'b', 'c']) +
    'tasks:\n  - { id: t1, title: T1, category: loot, windows: [{ from: b }] }\n',
);

const NONE = { added: [], removed: [], edited: [], renamed: [] };

describe('diffGuides', () => {
  it('reports nothing for identical guides', () => {
    expect(diffGuides(BASE, BASE)).toEqual({
      sections: NONE,
      tasks: NONE,
      categories: NONE,
      likelyRegenerated: false,
      progress: null,
    });
  });

  it('returns plain JSON data', () => {
    const d = diffGuides(BASE, guide(linear(['a', 'x', 'c'])));
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  it('flags a section title change', () => {
    const next = guide(
      linear(['a', 'b', 'c'], { b: 'B2' }) +
        'tasks:\n  - { id: t1, title: T1, category: loot, windows: [{ from: b }] }\n',
    );
    const d = diffGuides(BASE, next);
    expect(d.sections).toEqual({ ...NONE, edited: [{ id: 'b', fields: ['title'] }] });
    expect(d.tasks).toEqual(NONE);
  });

  it('flags the follower of an inserted leaf as requires-edited', () => {
    const groups = (extra: string): string => `sections:
  - id: g1
    title: G1
    overview: o
    sections:
      - { id: a, title: A, overview: o }${extra}
  - id: g2
    title: G2
    overview: o
    sections:
      - { id: b, title: B, overview: o }
`;
    const d = diffGuides(
      guide(groups('')),
      guide(groups('\n      - { id: n, title: N, overview: o }')),
    );
    expect(d.sections.added).toEqual(['n']);
    expect(d.sections.removed).toEqual([]);
    expect(d.sections.edited).toEqual([{ id: 'b', fields: ['requires'] }]);
  });

  it('does not flag siblings after a same-group insert as moved', () => {
    const d = diffGuides(guide(linear(['a', 'c', 'd'])), guide(linear(['a', 'b', 'c', 'd'])));
    expect(d.sections.added).toEqual(['b']);
    expect(d.sections.edited).toEqual([{ id: 'c', fields: ['requires'] }]);
  });

  it('does not flag siblings after a removal as moved', () => {
    const d = diffGuides(guide(linear(['a', 'b', 'c', 'd'])), guide(linear(['a', 'c', 'd'])));
    expect(d.sections.removed).toEqual(['b']);
    expect(d.sections.edited).toEqual([{ id: 'c', fields: ['requires'] }]);
  });

  it('flags swapped siblings as position', () => {
    const flat = (ids: string[]): string =>
      'sections:\n' +
      ids.map((id) => `  - { id: ${id}, title: ${id}, overview: o, requires: [] }\n`).join('');
    const d = diffGuides(guide(flat(['a', 'b', 'c'])), guide(flat(['a', 'c', 'b'])));
    expect(d.sections.edited).toEqual([
      { id: 'c', fields: ['position'] },
      { id: 'b', fields: ['position'] },
    ]);
  });

  it('ignores requires order but not form or duplicates', () => {
    const req = (r: unknown): ReturnType<typeof parseOk> => {
      const g = guide(linear(['a', 'b', 'c']));
      g.sections[2]!.requires = r as never;
      return g;
    };
    const base = req({ all: ['a', 'b'] });
    expect(diffGuides(base, req({ all: ['b', 'a'] })).sections.edited).toEqual([]);
    expect(diffGuides(base, req({ any: ['a', 'b'] })).sections.edited).toEqual([
      { id: 'c', fields: ['requires'] },
    ]);
    expect(diffGuides(base, req({ all: ['a', 'a', 'b'] })).sections.edited).toEqual([
      { id: 'c', fields: ['requires'] },
    ]);
  });

  it('flags a leaf moved to another group as position', () => {
    const line = '\n      - { id: m, title: M, overview: o, requires: [] }';
    const groups = (first: string, second: string): string => `sections:
  - id: g1
    title: G1
    overview: o
    requires: []
    sections:
      - { id: a, title: A, overview: o, requires: [] }${first}
  - id: g2
    title: G2
    overview: o
    requires: []
    sections:
      - { id: b, title: B, overview: o, requires: [] }${second}
`;
    const d = diffGuides(guide(groups(line, '')), guide(groups('', line)));
    expect(d.sections).toEqual({ ...NONE, edited: [{ id: 'm', fields: ['position'] }] });
  });

  it('reports a rename via renamed_from', () => {
    const next = guide(`sections:
  - { id: a, title: a, overview: o }
  - { id: bee, title: b, overview: o, renamed_from: [b] }
  - { id: c, title: c, overview: o }
tasks:
  - { id: t1, title: T1, category: loot, windows: [{ from: bee }] }
`);
    const d = diffGuides(BASE, next);
    expect(d.sections).toEqual({ ...NONE, renamed: [{ from: 'b', to: 'bee', fields: [] }] });
    expect(d.tasks).toEqual(NONE);
  });

  it('adds the changed fields to a rename', () => {
    const next = guide(`sections:
  - { id: a, title: a, overview: o }
  - { id: bee, title: Bee, overview: o, renamed_from: [b] }
  - { id: c, title: c, overview: o }
tasks:
  - { id: t1, title: T1, category: loot, windows: [{ from: bee }] }
`);
    const d = diffGuides(BASE, next);
    expect(d.sections.renamed).toEqual([{ from: 'b', to: 'bee', fields: ['title'] }]);
    expect(d.sections.edited).toEqual([]);
  });

  it('ignores a stale renamed_from', () => {
    const next = guide(`sections:
  - { id: a, title: a, overview: o }
  - { id: b, title: b, overview: o }
  - { id: c, title: c, overview: o }
  - { id: d, title: d, overview: o, renamed_from: [gone] }
`);
    const d = diffGuides(guide(linear(['a', 'b', 'c'])), next);
    expect(d.sections.added).toEqual(['d']);
    expect(d.sections.renamed).toEqual([]);
  });

  it('does not rename from an old ID that is still matched', () => {
    const next = withRenamed(guide(linear(['a', 'b', 'c', 'd'])), { d: ['b'] });
    const d = diffGuides(guide(linear(['a', 'b', 'c'])), next);
    expect(d.sections.added).toEqual(['d']);
    expect(d.sections.renamed).toEqual([]);
  });

  it('claims each old ID once; the first unmatched, unclaimed entry wins', () => {
    const next = withRenamed(guide(linear(['a', 'p', 'q'])), {
      p: ['a', 'x', 'y'],
      q: ['x', 'y'],
    });
    const d = diffGuides(guide(linear(['a', 'x', 'y'])), next);
    expect(d.sections.renamed.map((r) => [r.from, r.to])).toEqual([
      ['x', 'p'],
      ['y', 'q'],
    ]);
    expect(d.sections.added).toEqual([]);
    expect(d.sections.removed).toEqual([]);
  });

  it('translates references through the rename map', () => {
    const next = guide(`sections:
  - { id: a, title: a, overview: o }
  - { id: bee, title: b, overview: o, renamed_from: [b] }
  - { id: c, title: c, overview: o }
tasks:
  - { id: t1, title: T1, category: loot, windows: [{ from: bee }] }
`);
    const d = diffGuides(BASE, next);
    expect(d.tasks.edited).toEqual([]);
    expect(d.sections.edited).toEqual([]);
    expect(d.sections.renamed).toHaveLength(1);
  });

  it('never translates until: end', () => {
    const withUntil = (until: string): ReturnType<typeof parseOk> =>
      guide(
        linear(['a', 'b']) +
          `tasks:\n  - { id: t1, title: T1, category: loot, windows: [{ from: a, until: ${until} }] }\n`,
      );
    const old = withUntil('end');
    expect(diffGuides(old, withUntil('end')).tasks.edited).toEqual([]);
    expect(diffGuides(old, withUntil('b')).tasks.edited).toEqual([
      { id: 't1', fields: ['windows'] },
    ]);
  });

  it('diffs task fields in a fixed order, and task renames', () => {
    const old = guide(
      linear(['a']) +
        `tasks:
  - { id: t1, title: T1, category: loot, windows: [{ from: a }] }
  - { id: t2, title: T2, category: loot, windows: [{ from: a }] }
`,
    );
    const next = guide(
      linear(['a']) +
        `tasks:
  - { id: t1, title: New, category: loot, how: h, spoiler: true, windows: [{ from: a }] }
  - { id: t3, title: T2, category: loot, windows: [{ from: a }], renamed_from: [t2] }
`,
    );
    next.tasks[0]!.exclusive = 'e';
    const d = diffGuides(old, next);
    expect(d.tasks.edited).toEqual([
      { id: 't1', fields: ['title', 'how', 'exclusive', 'spoiler'] },
    ]);
    expect(d.tasks.renamed).toEqual([{ from: 't2', to: 't3', fields: [] }]);
    expect(d.tasks.added).toEqual([]);
    expect(d.tasks.removed).toEqual([]);
  });

  it('flags a task category change', () => {
    const cats = `${LOOT}  card:\n    name: Card\n    about: c\n`;
    const t = (c: string): string =>
      linear(['a']) + `tasks:\n  - { id: t1, title: T1, category: ${c}, windows: [{ from: a }] }\n`;
    const d = diffGuides(guide(t('loot'), cats), guide(t('card'), cats));
    expect(d.tasks.edited).toEqual([{ id: 't1', fields: ['category'] }]);
  });

  it('treats a renamed category as removed plus added', () => {
    const cats = (id: string): string =>
      `categories:\n  ${id}:\n    name: Loot\n    about: Stuff.\n`;
    const d = diffGuides(guide(linear(['a']), cats('loot')), guide(linear(['a']), cats('items')));
    expect(d.categories).toEqual({ ...NONE, added: ['items'], removed: ['loot'] });
  });

  it('diffs category fields', () => {
    const cat = (name: string, extra: string = ''): string =>
      `categories:\n  loot:\n    name: ${name}\n    about: Stuff.\n${extra}`;
    const o = guide(linear(['a']), cat('Loot'));
    expect(diffGuides(o, guide(linear(['a']), cat('Loot2'))).categories.edited).toEqual([
      { id: 'loot', fields: ['name'] },
    ]);
    expect(
      diffGuides(o, guide(linear(['a']), cat('Loot', '    tracked: false\n'))).categories.edited,
    ).toEqual([{ id: 'loot', fields: ['tracked'] }]);
  });

  describe('likelyRegenerated', () => {
    const ids = (prefix: string, n: number): string[] =>
      Array.from({ length: n }, (_, i) => `${prefix}${String.fromCharCode(97 + i)}`);

    it('is true when 10 elements are all replaced', () => {
      const d = diffGuides(guide(linear(ids('o', 10))), guide(linear(ids('n', 10))));
      expect(d.likelyRegenerated).toBe(true);
    });

    it('is false when 4 of 10 are removed', () => {
      const old = ids('o', 10);
      const next = [...old.slice(0, 6), ...ids('n', 4)];
      expect(diffGuides(guide(linear(old)), guide(linear(next))).likelyRegenerated).toBe(false);
    });

    it('is true at exactly 5 of 10 removed and 5 of 10 added', () => {
      const old = ids('o', 10);
      const next = [...old.slice(0, 5), ...ids('n', 5)];
      expect(diffGuides(guide(linear(old)), guide(linear(next))).likelyRegenerated).toBe(true);
    });

    it('is false below 10 old elements', () => {
      const d = diffGuides(guide(linear(ids('o', 9))), guide(linear(ids('n', 9))));
      expect(d.likelyRegenerated).toBe(false);
    });

    it('counts sections and tasks together', () => {
      const secs = linear(['sa', 'sb', 'sc', 'sd', 'se']);
      const t = (p: string): string =>
        'tasks:\n' +
        ids(p, 5)
          .map((id) => `  - { id: ${id}, title: T, category: loot, windows: [{ from: sa }] }\n`)
          .join('');
      const d = diffGuides(guide(secs + t('ot')), guide(secs + t('nt')));
      expect(d.likelyRegenerated).toBe(true);
    });

    it('does not count categories', () => {
      const cats = (p: string): string =>
        'categories:\n' +
        ids(p, 20)
          .map((id) => `  ${id}:\n    name: N\n    about: a\n`)
          .join('');
      const secs = linear(ids('s', 10));
      const d = diffGuides(guide(secs, cats('oc')), guide(secs, cats('nc')));
      expect(d.categories.added).toHaveLength(20);
      expect(d.likelyRegenerated).toBe(false);
    });

    it('does not count renames as removed or added', () => {
      const old = ids('o', 10);
      const renamed =
        'sections:\n' +
        old
          .map((id) => `  - { id: n${id}, title: ${id}, overview: o, renamed_from: [${id}] }\n`)
          .join('');
      const d = diffGuides(guide(linear(old)), guide(renamed));
      expect(d.sections.renamed).toHaveLength(10);
      expect(d.likelyRegenerated).toBe(false);
    });
  });
});
