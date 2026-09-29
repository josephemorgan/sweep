import { describe, expect, it } from 'vitest';
import { deriveCore } from '../../src/engine/derive.js';
import { loadGuide, parseOk, progress } from '../helpers.js';

const lk = loadGuide('lantern-keep');
const botw = loadGuide('botw-style');

function states(guide: typeof lk, p: Parameters<typeof progress>[0]): Record<string, string> {
  const view = deriveCore(guide, progress(p));
  return Object.fromEntries([...view.sections].map(([id, s]) => [id, s.state]));
}

describe('deriveCore sections on lantern-keep', () => {
  it('starts at the first leaf with nothing cleared', () => {
    const view = deriveCore(lk, progress());
    expect(view.current).toBe('village');
    expect(view.pinned).toBe(false);
    const s = states(lk, {});
    expect(s['village']).toBe('current');
    expect(s['marsh']).toBe('locked');
    expect(s['keep-gate']).toBe('locked');
    expect(s['epilogue']).toBe('locked');
    expect(s['act-1']).toBe('current');
    expect(s['act-2']).toBe('locked');
  });

  it('moves current on after a clear', () => {
    const view = deriveCore(lk, progress({ cleared: ['village'] }));
    expect(view.current).toBe('marsh');
    expect(view.sections.get('village')).toMatchObject({ state: 'cleared', cleared: true });
    expect(view.sections.get('act-1')!.state).toBe('current');
  });

  it('offers both towers once the keep gate is cleared', () => {
    const p = { cleared: ['village', 'marsh', 'keep-gate'] };
    const view = deriveCore(lk, progress(p));
    expect(view.sections.get('east-tower')!.unlocked).toBe(true);
    expect(view.sections.get('west-tower')!.unlocked).toBe(true);
    expect(view.current).toBe('east-tower');
    const s = states(lk, p);
    expect(s['west-tower']).toBe('available');
    expect(s['throne-room']).toBe('locked');
    expect(s['act-1']).toBe('cleared');
    expect(s['act-2']).toBe('current');
  });

  it('honours a pin on another unlocked leaf', () => {
    const p = { cleared: ['village', 'marsh', 'keep-gate'], pin: 'west-tower' };
    const view = deriveCore(lk, progress(p));
    expect(view.current).toBe('west-tower');
    expect(view.pinned).toBe(true);
    expect(states(lk, p)['east-tower']).toBe('available');
  });

  it('lets a pin sit on a locked leaf', () => {
    const view = deriveCore(lk, progress({ pin: 'epilogue' }));
    expect(view.current).toBe('epilogue');
    expect(view.pinned).toBe(true);
    expect(view.sections.get('epilogue')).toMatchObject({ state: 'current', unlocked: false });
  });

  it.each(['act-2', 'village', 'ghost'])('ignores an invalid pin on %s', (pin) => {
    const view = deriveCore(lk, progress({ cleared: ['village'], pin }));
    expect(view.current).toBe('marsh');
    expect(view.pinned).toBe(false);
  });

  it('ignores stored IDs that do not fit the guide', () => {
    const view = deriveCore(lk, progress({ cleared: ['ghost', 'act-1'] }));
    expect(view.current).toBe('village');
    expect(view.sections.get('act-1')!.cleared).toBe(false);
    expect(view.sections.get('village')!.state).toBe('current');
  });

  it('forced clear of a locked leaf unlocks what requires it', () => {
    const view = deriveCore(lk, progress({ cleared: ['keep-gate'] }));
    expect(view.sections.get('keep-gate')!.state).toBe('cleared');
    expect(view.sections.get('east-tower')!.unlocked).toBe(true);
    expect(view.current).toBe('village');
    expect(view.sections.get('marsh')!.state).toBe('locked');
  });

  it('makes a reopened leaf current again', () => {
    expect(deriveCore(lk, progress({ cleared: ['village', 'marsh'] })).current).toBe('keep-gate');
    expect(deriveCore(lk, progress({ cleared: ['village'] })).current).toBe('marsh');
  });

  it('has no current when everything is cleared', () => {
    const all = lk.sections.flatMap(function leaves(s): string[] {
      return s.children.length === 0 ? [s.id] : s.children.flatMap(leaves);
    });
    const view = deriveCore(lk, progress({ cleared: all }));
    expect(view.current).toBeNull();
    expect(view.sections.get('act-1')!.state).toBe('cleared');
  });

  it('reports reached and unlocked for groups', () => {
    const view = deriveCore(lk, progress({ cleared: ['village'] }));
    expect(view.sections.get('act-1')).toMatchObject({ unlocked: true, reached: true });
    expect(view.sections.get('act-2')).toMatchObject({ unlocked: false, reached: false });
    expect(view.sections.get('marsh')).toMatchObject({ unlocked: true, reached: true });
    expect(view.sections.get('village')).toMatchObject({ unlocked: true, reached: true });
  });
});

describe('deriveCore sections on botw-style', () => {
  const hyrule = ['kakariko', 'hateno', 'zoras-domain', 'hyrule-castle'];

  it('starts on the plateau', () => {
    expect(deriveCore(botw, progress()).current).toBe('plateau-shrines');
  });

  it('keeps the regions locked until the whole plateau is cleared', () => {
    const view = deriveCore(botw, progress({ cleared: ['plateau-shrines'] }));
    expect(view.current).toBe('paraglider');
    for (const id of hyrule) expect(view.sections.get(id)!.unlocked).toBe(false);
    for (const id of hyrule) expect(view.sections.get(id)!.state).toBe('locked');
  });

  it('opens every region together', () => {
    const view = deriveCore(botw, progress({ cleared: ['plateau-shrines', 'paraglider'] }));
    for (const id of hyrule) expect(view.sections.get(id)!.unlocked).toBe(true);
    expect(view.current).toBe('kakariko');
    expect(view.sections.get('hyrule')!.state).toBe('current');
    expect(view.sections.get('great-plateau')!.state).toBe('cleared');
  });
});

describe('deriveCore any-of requirements', () => {
  it('unlocks a section when any named section is cleared', () => {
    const guide = parseOk(`
sweep: 1
game: Any
sections:
  - id: a
    title: A
    overview: o
  - id: b
    title: B
    overview: o
    requires: []
  - id: c
    title: C
    overview: o
    requires: { any: [a, b] }
`);
    const view = deriveCore(guide, progress({ cleared: ['b'] }));
    expect(view.sections.get('c')!.unlocked).toBe(true);
    expect(deriveCore(guide, progress()).sections.get('c')!.unlocked).toBe(false);
  });
});

describe('deriveCore gates through groups', () => {
  const header = `
sweep: 1
game: Groups
sections:
  - id: a
    title: A
    overview: o
    requires: []
`;

  it('keeps inner leaves locked while the outer gate is closed, even if the inner gate is open', () => {
    const guide = parseOk(`${header}
  - id: outer
    title: Outer
    overview: o
    requires: [a]
    sections:
      - id: inner
        title: Inner
        overview: o
        requires: []
        sections:
          - { id: leaf-1, title: L1, overview: o, requires: [] }
          - { id: leaf-2, title: L2, overview: o, requires: [] }
`);
    const view = deriveCore(guide, progress());
    expect(view.sections.get('leaf-1')).toMatchObject({ unlocked: false, state: 'locked' });
    expect(view.sections.get('leaf-2')!.unlocked).toBe(false);
    expect(view.sections.get('inner')).toMatchObject({ unlocked: false, reached: false });
    const after = deriveCore(guide, progress({ cleared: ['a'] }));
    expect(after.sections.get('leaf-1')!.unlocked).toBe(true);
  });

  it('accepts a group in requires, all-of', () => {
    const guide = parseOk(`${header}
  - id: g
    title: G
    overview: o
    requires: []
    sections:
      - { id: g1, title: G1, overview: o, requires: [] }
      - { id: g2, title: G2, overview: o, requires: [] }
  - { id: after, title: After, overview: o, requires: [g] }
`);
    expect(deriveCore(guide, progress({ cleared: ['g1'] })).sections.get('after')!.unlocked).toBe(
      false,
    );
    expect(
      deriveCore(guide, progress({ cleared: ['g1', 'g2'] })).sections.get('after')!.unlocked,
    ).toBe(true);
  });

  it('accepts a group in requires, any-of', () => {
    const guide = parseOk(`${header}
  - id: g
    title: G
    overview: o
    requires: []
    sections:
      - { id: g1, title: G1, overview: o, requires: [] }
      - { id: g2, title: G2, overview: o, requires: [] }
  - { id: x, title: X, overview: o, requires: [] }
  - { id: after, title: After, overview: o, requires: { any: [g, x] } }
`);
    const at = (cleared: string[]): boolean | undefined =>
      deriveCore(guide, progress({ cleared })).sections.get('after')!.unlocked;
    expect(at(['g1'])).toBe(false);
    expect(at(['g1', 'g2'])).toBe(true);
    expect(at(['x'])).toBe(true);
  });

  it('reaches a locked group through a forced-cleared leaf inside it', () => {
    const guide = parseOk(`${header}
  - id: g
    title: G
    overview: o
    requires: [a]
    sections:
      - { id: g1, title: G1, overview: o, requires: [] }
      - { id: g2, title: G2, overview: o, requires: [] }
  - id: solo
    title: Solo
    overview: o
    requires: [a]
    sections:
      - { id: only, title: Only, overview: o, requires: [] }
`);
    const view = deriveCore(guide, progress({ cleared: ['g2', 'only'] }));
    // Precedence (§4.5): cleared, then current, then locked or available by reached.
    expect(view.sections.get('g')).toMatchObject({
      reached: true,
      cleared: false,
      unlocked: false,
    });
    expect(view.sections.get('g')!.state).toBe('available');
    expect(view.sections.get('g1')!.state).toBe('locked');
    expect(view.sections.get('solo')).toMatchObject({ reached: true, cleared: true });
    expect(view.sections.get('solo')!.state).toBe('cleared');
    // current stays on the first unlocked, uncleared leaf, outside the group.
    expect(view.current).toBe('a');
  });
});
