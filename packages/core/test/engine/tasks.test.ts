import { describe, expect, it } from 'vitest';
import { deriveCore } from '../../src/engine/derive.js';
import { loadGuide, parseOk, progress } from '../helpers.js';

const lk = loadGuide('lantern-keep');
const ff8 = loadGuide('ff8-style');
const botw = loadGuide('botw-style');

function status(guide: typeof lk, p: Parameters<typeof progress>[0], id: string): unknown {
  return deriveCore(guide, progress(p)).tasks.get(id);
}

const LOOT = `
categories:
  loot:
    name: Loot
    about: Stuff.
`;

describe('task status on lantern-keep', () => {
  it('with empty progress', () => {
    const view = deriveCore(lk, progress());
    expect(view.tasks.get('ferry-passage')).toEqual({
      kind: 'open',
      window: 0,
      secondChance: false,
    });
    expect(view.tasks.get('village-chest')!.kind).toBe('open');
    expect(view.tasks.get('lost-cat')).toEqual({ kind: 'open', window: 0, secondChance: false });
    for (const id of ['marsh-herbs', 'keep-history', 'sunblade', 'keepers-lantern']) {
      expect(view.tasks.get(id)).toEqual({ kind: 'upcoming' });
    }
    expect(view.tasks.size).toBe(lk.tasks.length);
  });

  it('after the village is cleared', () => {
    const p = { cleared: ['village'] };
    expect(status(lk, p, 'ferry-passage')).toEqual({ kind: 'missed', nextChance: null });
    expect(status(lk, p, 'lost-cat')).toEqual({ kind: 'missed', nextChance: 'epilogue' });
    expect(status(lk, p, 'village-chest')).toMatchObject({ kind: 'open' });
    expect(status(lk, p, 'marsh-herbs')).toMatchObject({ kind: 'open' });
  });

  it('after the marsh is cleared', () => {
    const p = { cleared: ['village', 'marsh'] };
    expect(status(lk, p, 'village-chest')).toEqual({ kind: 'missed', nextChance: null });
    expect(status(lk, p, 'keep-history')).toMatchObject({ kind: 'open' });
  });

  it('opens a second chance', () => {
    const p = {
      cleared: ['village', 'marsh', 'keep-gate', 'east-tower', 'west-tower', 'throne-room'],
    };
    const view = deriveCore(lk, progress(p));
    expect(view.tasks.get('lost-cat')).toEqual({ kind: 'open', window: 1, secondChance: true });
    expect(view.windows.get('lost-cat')).toEqual(['closed', 'open']);
  });

  it('reports a status per window', () => {
    const view = deriveCore(lk, progress());
    expect(view.windows.get('lost-cat')).toEqual(['open', 'upcoming']);
    expect(view.windows.get('village-chest')).toEqual(['open']);
    expect(view.windows.size).toBe(lk.tasks.length);
  });

  it('shows an exclusive choice', () => {
    const p = { cleared: ['village', 'marsh', 'keep-gate'], tasks: { sunblade: 'done' as const } };
    expect(status(lk, p, 'sunblade')).toEqual({ kind: 'done' });
    expect(status(lk, p, 'moonshield')).toEqual({ kind: 'not-chosen' });
  });

  it('shows both done when both are stored done', () => {
    const p = { tasks: { sunblade: 'done' as const, moonshield: 'done' as const } };
    expect(status(lk, p, 'sunblade')).toEqual({ kind: 'done' });
    expect(status(lk, p, 'moonshield')).toEqual({ kind: 'done' });
  });

  it('marks a third exclusive member not-chosen when another has stored done', () => {
    const guide = parseOk(`
sweep: 1
game: X
${LOOT}
sections:
  - id: a
    title: A
    overview: o
tasks:
  - { id: t1, title: T1, category: loot, exclusive: pick, windows: [{ from: a }] }
  - { id: t2, title: T2, category: loot, exclusive: pick, windows: [{ from: a }] }
  - { id: t3, title: T3, category: loot, exclusive: pick, windows: [{ from: a }] }
`);
    const p = { tasks: { t1: 'done' as const, t2: 'done' as const } };
    expect(status(guide, p, 't1')).toEqual({ kind: 'done' });
    expect(status(guide, p, 't2')).toEqual({ kind: 'done' });
    expect(status(guide, p, 't3')).toEqual({ kind: 'not-chosen' });
    // dont-care on another member does not choose.
    expect(status(guide, { tasks: { t1: 'dont-care' } }, 't3')).toMatchObject({ kind: 'open' });
  });

  it('honours stored states over windows', () => {
    expect(status(lk, { tasks: { 'ferry-passage': 'dont-care' } }, 'ferry-passage')).toEqual({
      kind: 'dont-care',
    });
    expect(status(lk, { tasks: { sunblade: 'done' } }, 'sunblade')).toEqual({ kind: 'done' });
  });

  it('closes a window whose until is cleared before from is reached', () => {
    const view = deriveCore(lk, progress({ cleared: ['throne-room'] }));
    expect(view.windows.get('sunblade')).toEqual(['closed']);
    expect(view.tasks.get('sunblade')).toEqual({ kind: 'missed', nextChance: null });
  });

  it('ignores stored task state under a section ID or an unknown ID', () => {
    const base = deriveCore(lk, progress());
    const view = deriveCore(
      lk,
      progress({ tasks: { village: 'done', ghost: 'done', marsh: 'dont-care' } }),
    );
    expect(view.tasks).toEqual(base.tasks);
    expect(view.windows).toEqual(base.windows);
  });

  it('a group until closes only when every leaf under it is cleared', () => {
    const guide = parseOk(`
sweep: 1
game: X
${LOOT}
sections:
  - id: g
    title: G
    overview: o
    requires: []
    sections:
      - { id: g1, title: G1, overview: o, requires: [] }
      - { id: g2, title: G2, overview: o, requires: [] }
tasks:
  - { id: t, title: T, category: loot, windows: [{ from: g1, until: g }] }
`);
    expect(status(guide, { cleared: ['g1'] }, 't')).toMatchObject({ kind: 'open' });
    expect(status(guide, { cleared: ['g1', 'g2'] }, 't')).toEqual({
      kind: 'missed',
      nextChance: null,
    });
  });

  it('opens a window from a group when ANY leaf under it is reached (R7)', () => {
    const guide = parseOk(`
sweep: 1
game: X
${LOOT}
sections:
  - id: a
    title: A
    overview: o
    requires: []
  - id: g
    title: G
    overview: o
    requires: []
    sections:
      - { id: g1, title: G1, overview: o, requires: [a] }
      - { id: g2, title: G2, overview: o, requires: [] }
tasks:
  - { id: t, title: T, category: loot, windows: [{ from: g }] }
`);
    const view = deriveCore(guide, progress());
    expect(view.sections.get('g1')!.unlocked).toBe(false);
    expect(view.sections.get('g2')!.unlocked).toBe(true);
    expect(view.windows.get('t')).toEqual(['open']);
    expect(view.tasks.get('t')).toEqual({ kind: 'open', window: 0, secondChance: false });
  });
});

describe('task status on ff8-style', () => {
  it('misses the first window and waits for the return', () => {
    const p = { cleared: ['balamb-garden', 'fire-cavern', 'dollet'] };
    expect(status(ff8, p, 'quistis-card')).toEqual({ kind: 'missed', nextChance: 'garden-return' });
    expect(status(ff8, p, 'dollet-pub-card')).toEqual({ kind: 'missed', nextChance: null });
  });

  it('opens the second chance', () => {
    const p = { cleared: ['balamb-garden', 'fire-cavern', 'dollet', 'timber', 'deling-city'] };
    expect(status(ff8, p, 'quistis-card')).toEqual({ kind: 'open', window: 1, secondChance: true });
  });
});

describe('task status on botw-style', () => {
  it('opens the koroks and the until-end shrine', () => {
    const view = deriveCore(botw, progress({ cleared: ['plateau-shrines', 'paraglider'] }));
    const koroks = ['korok-hateno-rock-circle', 'korok-kakariko-pinwheel', 'korok-zora-waterfall'];
    for (const id of koroks) expect(view.tasks.get(id)!.kind).toBe('open');
    expect(view.tasks.get('oman-au-shrine')!.kind).toBe('open');
  });
});
