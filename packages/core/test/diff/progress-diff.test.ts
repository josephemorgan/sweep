import { describe, expect, it } from 'vitest';
import { diffGuides } from '../../src/diff/diff-guides.js';
import { migrateProgress } from '../../src/diff/migrate-progress.js';
import { progressToDto } from '../../src/model/progress.js';
import { loadGuide, parseOk, progress } from '../helpers.js';

const CATS = `categories:
  loot:
    name: Loot
    about: Stuff.
`;

function guide(body: string, categories: string = CATS): ReturnType<typeof parseOk> {
  return parseOk(`sweep: 1\ngame: X\n${categories}\n${body}`);
}

const OLD = guide(`sections:
  - { id: a, title: A, overview: o }
  - { id: b, title: B, overview: o }
  - { id: c, title: C, overview: o }
tasks:
  - { id: t, title: T, category: loot, windows: [{ from: b }] }
  - { id: gone-task, title: G, category: loot, windows: [{ from: a }] }
`);

const RENAMED = guide(`sections:
  - { id: a, title: A, overview: o }
  - { id: bee, title: B, overview: o, renamed_from: [b] }
  - { id: c, title: C, overview: o }
tasks:
  - { id: tee, title: T, category: loot, windows: [{ from: bee }], renamed_from: [t] }
  - { id: gone-task, title: G, category: loot, windows: [{ from: a }] }
`);

describe('progress diff', () => {
  it('is null without progress', () => {
    expect(diffGuides(OLD, RENAMED).progress).toBeNull();
  });

  it('migrates renamed progress and reports it', () => {
    const p = progress({ cleared: ['b'], pin: 'b', tasks: { t: 'done' } });
    const d = diffGuides(OLD, RENAMED, p);
    expect(d.progress).toEqual({
      migrated: [
        { kind: 'cleared', from: 'b', to: 'bee' },
        { kind: 'pin', from: 'b', to: 'bee' },
        { kind: 'task', from: 't', to: 'tee' },
      ],
      orphaned: [],
      restored: [],
    });
    const moved = migrateProgress(p, d);
    expect(progressToDto(moved)).toEqual({
      cleared: ['bee'],
      pin: 'bee',
      tasks: { tee: 'done' },
      tracked: {},
    });
    // The input is untouched.
    expect(progressToDto(p)).toEqual({
      cleared: ['b'],
      pin: 'b',
      tasks: { t: 'done' },
      tracked: {},
    });
  });

  it('migrates even when diff.progress is null', () => {
    const p = progress({ cleared: ['b'], pin: 'b', tasks: { t: 'done' } });
    const moved = migrateProgress(p, diffGuides(OLD, RENAMED));
    expect(progressToDto(moved)).toEqual({
      cleared: ['bee'],
      pin: 'bee',
      tasks: { tee: 'done' },
      tracked: {},
    });
  });

  it('lets progress under the new ID win, leaving the old entry orphaned', () => {
    const p = progress({ cleared: ['b', 'bee'], tasks: { t: 'done', tee: 'dont-care' } });
    const d = diffGuides(OLD, RENAMED, p);
    expect(d.progress).toEqual({
      migrated: [],
      orphaned: [
        { kind: 'cleared', id: 'b' },
        { kind: 'task', id: 't' },
      ],
      restored: [
        { kind: 'cleared', id: 'bee' },
        { kind: 'task', id: 'tee' },
      ],
    });
    const moved = migrateProgress(p, d);
    expect(progressToDto(moved)).toEqual(progressToDto(p));
    expect(moved).not.toBe(p);
  });

  it('orphans progress for removed IDs, and lists them sorted', () => {
    const next = guide(`sections:
  - { id: a, title: A, overview: o }
tasks: []
`);
    const p = progress({
      cleared: ['gone', 'c', 'b'],
      pin: 'c',
      tasks: { t: 'done' },
    });
    const d = diffGuides(OLD, next, p);
    expect(d.progress).toEqual({
      migrated: [],
      orphaned: [
        { kind: 'cleared', id: 'b' },
        { kind: 'cleared', id: 'c' },
        { kind: 'pin', id: 'c' },
        { kind: 'task', id: 't' },
      ],
      restored: [],
    });
  });

  it('does not list an ID that was already orphaned in both guides', () => {
    const p = progress({ cleared: ['gone'] });
    expect(diffGuides(OLD, OLD, p).progress).toEqual({
      migrated: [],
      orphaned: [],
      restored: [],
    });
  });

  it('orphans a cleared leaf that becomes a group, and a pin on it', () => {
    const next = guide(`sections:
  - { id: a, title: A, overview: o }
  - id: b
    title: B
    overview: o
    sections:
      - { id: b1, title: B1, overview: o }
  - { id: c, title: C, overview: o }
tasks: []
`);
    const d = diffGuides(OLD, next, progress({ cleared: ['b'], pin: 'b' }));
    expect(d.progress?.orphaned).toEqual([
      { kind: 'cleared', id: 'b' },
      { kind: 'pin', id: 'b' },
    ]);
  });

  it('orphans progress on a renamed leaf that becomes a group', () => {
    const next = guide(`sections:
  - { id: a, title: A, overview: o }
  - id: bee
    title: B
    overview: o
    renamed_from: [b]
    sections:
      - { id: b1, title: B1, overview: o }
  - { id: c, title: C, overview: o }
tasks: []
`);
    const p = progress({ cleared: ['b'], pin: 'b' });
    const d = diffGuides(OLD, next, p);
    expect(d.sections.renamed.map((r) => r.to)).toEqual(['bee']);
    expect(d.progress).toEqual({
      migrated: [],
      orphaned: [
        { kind: 'cleared', id: 'b' },
        { kind: 'pin', id: 'b' },
      ],
      restored: [],
    });
    const moved = migrateProgress(p, d);
    expect(progressToDto(moved)).toEqual(progressToDto(p));
  });

  it('does not migrate a stored group ID whose group is renamed to a leaf', () => {
    const old = guide(`sections:
  - id: g
    title: G
    overview: o
    sections:
      - { id: g1, title: G1, overview: o }
tasks: []
`);
    const next = guide(`sections:
  - { id: gee, title: G, overview: o, renamed_from: [g] }
tasks: []
`);
    const p = progress({ cleared: ['g'] });
    const d = diffGuides(old, next, p);
    expect(d.sections.renamed.map((r) => r.to)).toEqual(['gee']);
    expect(d.progress).toEqual({ migrated: [], orphaned: [], restored: [] });
    expect(progressToDto(migrateProgress(p, d))).toEqual(progressToDto(p));
  });

  it('restores progress whose ID comes back', () => {
    const old = guide(`sections:
  - { id: a, title: A, overview: o }
tasks: []
`);
    const next = guide(`sections:
  - { id: a, title: A, overview: o }
tasks:
  - { id: old-task, title: O, category: loot, windows: [{ from: a }] }
`);
    const d = diffGuides(old, next, progress({ tasks: { 'old-task': 'done' } }));
    expect(d.progress).toEqual({
      migrated: [],
      orphaned: [],
      restored: [{ kind: 'task', id: 'old-task' }],
    });
  });

  it('orphans a tracked override for a removed category', () => {
    const next = guide(
      'sections:\n  - { id: a, title: A, overview: o }\n',
      CATS.replace('loot', 'x'),
    );
    const p = progress({ tracked: { loot: false, x: true } });
    const d = diffGuides(OLD, next, p);
    expect(d.progress).toEqual({
      migrated: [],
      orphaned: [{ kind: 'tracked', id: 'loot' }],
      restored: [{ kind: 'tracked', id: 'x' }],
    });
    expect(progressToDto(migrateProgress(p, d)).tracked).toEqual({ loot: false, x: true });
  });

  it('leaves nothing to migrate after migrating (lantern-keep, two renames)', () => {
    const old = loadGuide('lantern-keep');
    const next = structuredClone(old);
    const rename = (from: string, to: string): void => {
      const walk = (list: typeof next.sections): void => {
        for (const s of list) {
          if (s.id === from) {
            s.id = to;
            s.renamedFrom = [from];
          }
          s.requires =
            'all' in s.requires
              ? { all: s.requires.all.map((r) => (r === from ? to : r)) }
              : { any: s.requires.any.map((r) => (r === from ? to : r)) };
          walk(s.children);
        }
      };
      walk(next.sections);
      for (const t of next.tasks) {
        for (const w of t.windows) {
          if (w.from === from) w.from = to;
          if (w.until === from) w.until = to;
          if (w.home === from) w.home = to;
        }
      }
    };
    rename('village', 'harrow');
    rename('marsh', 'whisper');
    const t = next.tasks.find((x) => x.id === 'ferry-passage')!;
    t.id = 'ferry';
    t.renamedFrom = ['ferry-passage'];

    const p = progress({
      cleared: ['village', 'marsh'],
      pin: 'marsh',
      tasks: { 'ferry-passage': 'done' },
      tracked: { lore: true },
    });
    const d = diffGuides(old, next, p);
    expect(d.sections.renamed.map((r) => r.to)).toEqual(['harrow', 'whisper']);
    expect(d.progress!.migrated).toHaveLength(4);
    const moved = migrateProgress(p, d);
    expect(progressToDto(moved)).toEqual({
      cleared: ['harrow', 'whisper'],
      pin: 'whisper',
      tasks: { ferry: 'done' },
      tracked: { lore: true },
    });
    expect(diffGuides(old, next, moved).progress!.migrated).toEqual([]);
  });
});
