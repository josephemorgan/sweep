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
    expect(view.windows.size).toBe(0);
    expect(view.tasks.size).toBe(0);
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
