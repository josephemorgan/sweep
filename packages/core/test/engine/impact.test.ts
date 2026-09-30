import { describe, expect, it } from 'vitest';
import { clearImpact } from '../../src/engine/clear-impact.js';
import { deriveRun } from '../../src/engine/derive.js';
import { deriveMetricTasks, deriveMetrics, type Metrics } from '../../src/engine/metrics.js';
import { loadGuide, progress } from '../helpers.js';

const lk = loadGuide('lantern-keep');
const ff6 = loadGuide('ff6-style');
const ff8 = loadGuide('ff8-style');
const botw = loadGuide('botw-style');

type P = Parameters<typeof progress>[0];
function metrics(guide: typeof lk, p: P, category?: string | null): Metrics {
  const prog = progress(p);
  return deriveMetrics(guide, prog, deriveRun(guide, prog), category);
}
const EMPTY = { closing: [], lastChance: [], unlocks: [], wasLocked: false };

describe('clearImpact on lantern-keep', () => {
  it('lists what closes, in task file order', () => {
    expect(clearImpact(lk, progress(), 'village')).toEqual({
      closing: [
        { taskId: 'ferry-passage', nextChance: null },
        { taskId: 'lost-cat', nextChance: 'epilogue' },
      ],
      lastChance: [{ taskId: 'ferry-passage', nextChance: null }],
      unlocks: ['marsh'],
      wasLocked: false,
    });
  });

  it('computes the metrics with a category filter', () => {
    expect(metrics(lk, {})).toEqual({ here: 3, now: 3, closing: 2, lastChance: 1 });
    expect(metrics(lk, {}, null)).toEqual({ here: 3, now: 3, closing: 2, lastChance: 1 });
    expect(metrics(lk, {}, 'quests')).toEqual({ here: 1, now: 1, closing: 1, lastChance: 0 });
  });

  it('gives zeros for an untracked or unknown category', () => {
    const zero = { here: 0, now: 0, closing: 0, lastChance: 0 };
    expect(metrics(lk, {}, 'lore')).toEqual(zero);
    expect(metrics(lk, {}, 'nope')).toEqual(zero);
  });

  it('does not list already-missed tasks again', () => {
    expect(clearImpact(lk, progress({ cleared: ['village'] }), 'marsh').closing).toEqual([
      { taskId: 'village-chest', nextChance: null },
    ]);
  });

  it('reports wasLocked for a locked leaf', () => {
    expect(clearImpact(lk, progress(), 'epilogue').wasLocked).toBe(true);
  });

  it('removes the pin in the after state', () => {
    expect(clearImpact(lk, progress({ pin: 'village' }), 'village').unlocks).toEqual(['marsh']);
  });

  it('is a no-op for a group, an unknown ID or an already cleared leaf', () => {
    const groupId = lk.sections.find((s) => s.children.length > 0)?.id;
    expect(groupId).toBeDefined();
    expect(clearImpact(lk, progress(), groupId!)).toEqual(EMPTY);
    expect(clearImpact(lk, progress(), 'no-such-section')).toEqual(EMPTY);
    expect(clearImpact(lk, progress({ cleared: ['village'] }), 'village')).toEqual(EMPTY);
  });

  it('has no current once everything is cleared', () => {
    const leaves = lk.sections.flatMap(function walk(s): string[] {
      return s.children.length === 0 ? [s.id] : s.children.flatMap(walk);
    });
    const p = progress({ cleared: leaves });
    const run = deriveRun(lk, p);
    expect(run.current).toBeNull();
    const openToEnd = lk.tasks.filter(
      (t) =>
        run.tasks.get(t.id)!.kind === 'open' &&
        lk.categories.find((c) => c.id === t.category)!.tracked,
    ).length;
    expect(deriveMetrics(lk, p, run)).toEqual({
      here: 0,
      now: openToEnd,
      closing: 0,
      lastChance: 0,
    });
  });
});

describe('clearImpact on ff8-style (§3.9.2)', () => {
  const p = { cleared: ['balamb-garden', 'fire-cavern'] };
  it('matches the spec numbers', () => {
    expect(metrics(ff8, p)).toEqual({ here: 1, now: 2, closing: 2, lastChance: 1 });
    expect(clearImpact(ff8, progress(p), 'dollet').closing).toEqual([
      { taskId: 'quistis-card', nextChance: 'garden-return' },
      { taskId: 'dollet-pub-card', nextChance: null },
    ]);
  });
});

describe('clearImpact on ff6-style (§3.9.3)', () => {
  it('lists both relics with the next chance', () => {
    const impact = clearImpact(ff6, progress({ cleared: ['south-figaro'] }), 'returner-hideout');
    expect(impact.closing).toHaveLength(2);
    expect(impact.closing.map((c) => c.nextChance)).toEqual(['figaro-cave', 'figaro-cave']);
    expect(impact.lastChance).toEqual([]);
  });
  it('excludes a not-chosen task', () => {
    const impact = clearImpact(
      ff6,
      progress({ cleared: ['south-figaro'], tasks: { gauntlet: 'done' } }),
      'returner-hideout',
    );
    expect(impact.closing).toEqual([]);
  });
});

describe('metrics on botw-style (§3.9.1)', () => {
  it('counts HERE and NOW', () => {
    expect(metrics(botw, { cleared: ['plateau-shrines', 'paraglider'] })).toEqual({
      here: 1,
      now: 4,
      closing: 0,
      lastChance: 0,
    });
  });
  it('counts HERE at a pinned leaf', () => {
    const m = metrics(botw, { cleared: ['plateau-shrines', 'paraglider'], pin: 'hateno' });
    expect(m.here).toBe(1);
  });
});

describe('deriveMetricTasks', () => {
  function tasks(guide: typeof lk, p: P, category?: string | null) {
    const prog = progress(p);
    return deriveMetricTasks(guide, prog, deriveRun(guide, prog), category);
  }

  it('lists the tasks behind each metric, in task file order', () => {
    expect(tasks(lk, {})).toEqual({
      here: ['ferry-passage', 'village-chest', 'lost-cat'],
      now: ['ferry-passage', 'village-chest', 'lost-cat'],
      closing: [
        { taskId: 'ferry-passage', nextChance: null },
        { taskId: 'lost-cat', nextChance: 'epilogue' },
      ],
      lastChance: [{ taskId: 'ferry-passage', nextChance: null }],
    });
  });

  it('applies the category filter', () => {
    expect(tasks(lk, {}, 'loot')).toEqual({
      here: ['village-chest'],
      now: ['village-chest'],
      closing: [],
      lastChance: [],
    });
  });

  it('agrees with deriveMetrics everywhere', () => {
    const cases: [typeof lk, P][] = [
      [lk, {}],
      [lk, { cleared: ['village'] }],
      [lk, { cleared: ['village', 'marsh', 'keep-gate'], pin: 'west-tower' }],
      [ff6, {}],
      [ff8, {}],
      [botw, {}],
    ];
    for (const [guide, p] of cases) {
      const t = tasks(guide, p);
      expect(metrics(guide, p)).toEqual({
        here: t.here.length,
        now: t.now.length,
        closing: t.closing.length,
        lastChance: t.lastChance.length,
      });
    }
  });
});
