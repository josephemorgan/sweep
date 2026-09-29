import { describe, expect, it } from 'vitest';
import { deriveRun } from '../../src/engine/derive.js';
import { loadGuide, progress } from '../helpers.js';

const lk = loadGuide('lantern-keep');
const ff6 = loadGuide('ff6-style');
const ff8 = loadGuide('ff8-style');

function card(
  guide: typeof lk,
  p: Parameters<typeof progress>[0],
  leaf: string,
): { categoryId: string; rows: string[]; done: number; total: number; missed: number }[] {
  return deriveRun(guide, progress(p))
    .cards.get(leaf)!
    .categories.map((c) => ({
      categoryId: c.categoryId,
      rows: c.rows.map((r) => r.taskId),
      done: c.done,
      total: c.total,
      missed: c.missed,
    }));
}

describe('cards on lantern-keep', () => {
  it('lists tracked categories in category order with empty progress', () => {
    expect(card(lk, {}, 'village')).toEqual([
      { categoryId: 'story', rows: ['ferry-passage'], done: 0, total: 1, missed: 0 },
      { categoryId: 'loot', rows: ['village-chest'], done: 0, total: 1, missed: 0 },
      { categoryId: 'quests', rows: ['lost-cat'], done: 0, total: 1, missed: 0 },
    ]);
  });

  it('gives every leaf a card, empty when only untracked categories apply', () => {
    const run = deriveRun(lk, progress());
    expect(run.cards.size).toBe(7);
    expect(run.cards.get('east-tower')).toEqual({ leafId: 'east-tower', categories: [] });
  });

  it('lists an open task as a 2nd-chance row on its later home', () => {
    const run = deriveRun(lk, progress());
    const cat = run.cards.get('epilogue')!.categories;
    expect(cat).toHaveLength(1);
    expect(cat[0]!.categoryId).toBe('quests');
    expect(cat[0]!.rows).toEqual([
      { taskId: 'lost-cat', status: run.tasks.get('lost-cat'), secondChance: true },
    ]);
  });

  it('shows an untracked category once tracked', () => {
    expect(card(lk, { tracked: { lore: true } }, 'east-tower')).toEqual([
      { categoryId: 'lore', rows: ['keep-history'], done: 0, total: 1, missed: 0 },
    ]);
  });

  it('hides a category the run untracked, and drops its tasks from the summary', () => {
    const run = deriveRun(lk, progress({ tracked: { loot: false } }));
    expect(run.tracked).toEqual(new Set(['story', 'quests']));
    for (const c of run.cards.values()) {
      expect(c.categories.map((x) => x.categoryId)).not.toContain('loot');
    }
    expect(run.summary.tasksTotal).toBe(2);
  });

  it('counts missed rows', () => {
    const run = deriveRun(lk, progress({ cleared: ['village'] }));
    const cats = run.cards.get('village')!.categories;
    const quests = cats.find((c) => c.categoryId === 'quests')!;
    expect(quests.rows).toEqual([
      {
        taskId: 'lost-cat',
        status: { kind: 'missed', nextChance: 'epilogue' },
        secondChance: false,
      },
    ]);
    expect([quests.done, quests.total, quests.missed]).toEqual([0, 1, 1]);
    const story = cats.find((c) => c.categoryId === 'story')!;
    expect(story.rows[0]).toMatchObject({ taskId: 'ferry-passage', status: { kind: 'missed' } });
  });

  it('drops a done task from 2nd-chance cards and counts it done at home', () => {
    const p = { cleared: ['village'], tasks: { 'lost-cat': 'done' as const } };
    const run = deriveRun(lk, progress(p));
    expect(run.cards.get('epilogue')!.categories).toEqual([]);
    const quests = run.cards.get('village')!.categories.find((c) => c.categoryId === 'quests')!;
    expect([quests.done, quests.total, quests.missed]).toEqual([1, 1, 0]);
  });

  it('reports group progress', () => {
    const run = deriveRun(lk, progress({ cleared: ['village'] }));
    expect(run.groups.get('act-1')).toEqual({ cleared: 1, total: 2 });
    expect(run.groups.has('village')).toBe(false);
  });

  it('summarises leaves and tasks', () => {
    expect(deriveRun(lk, progress()).summary).toEqual({
      leavesCleared: 0,
      leavesTotal: 7,
      tasksDone: 0,
      tasksTotal: 7,
    });
    const run = deriveRun(
      lk,
      progress({ tasks: { sunblade: 'done', 'village-chest': 'dont-care' } }),
    );
    expect(run.summary).toMatchObject({ tasksDone: 1, tasksTotal: 5 });
  });
});

describe('cards on ff6-style (exclusive relics)', () => {
  it('counts both relics open at the hideout', () => {
    expect(card(ff6, { cleared: ['south-figaro'] }, 'returner-hideout')).toEqual([
      { categoryId: 'relics', rows: ['gauntlet', 'genji-glove'], done: 0, total: 2, missed: 0 },
    ]);
  });

  it('counts the chosen one done and the other not-chosen', () => {
    const run = deriveRun(
      ff6,
      progress({ cleared: ['south-figaro'], tasks: { gauntlet: 'done' } }),
    );
    const relics = run.cards.get('returner-hideout')!.categories[0]!;
    expect([relics.done, relics.total]).toEqual([1, 1]);
    expect(run.tasks.get('genji-glove')).toEqual({ kind: 'not-chosen' });
  });

  it('lists both as 2nd-chance rows while unresolved, neither once gauntlet is done', () => {
    const cleared = ['south-figaro', 'returner-hideout'];
    const run = deriveRun(ff6, progress({ cleared }));
    const cave = run.cards.get('figaro-cave')!.categories[0]!;
    expect(cave.rows.map((r) => [r.taskId, r.secondChance])).toEqual([
      ['gauntlet', true],
      ['genji-glove', true],
    ]);
    const hideout = run.cards.get('returner-hideout')!.categories[0]!;
    expect(hideout.rows.map((r) => r.status)).toEqual([
      { kind: 'missed', nextChance: 'figaro-cave' },
      { kind: 'missed', nextChance: 'figaro-cave' },
    ]);
    expect(hideout.missed).toBe(2);

    const done = deriveRun(ff6, progress({ cleared, tasks: { gauntlet: 'done' } }));
    expect(done.cards.get('figaro-cave')!.categories).toEqual([]);
  });
});

describe('cards on ff8-style', () => {
  it('shows a missed card at its primary home and lists it at garden-return', () => {
    const run = deriveRun(ff8, progress({ cleared: ['balamb-garden', 'fire-cavern', 'dollet'] }));
    const home = run.cards.get('balamb-garden')!.categories[0]!;
    expect(home.rows.map((r) => r.taskId)).toEqual(['quistis-card']);
    expect(home.rows[0]!.status.kind).toBe('missed');
    expect(home.missed).toBe(1);
    const back = run.cards.get('garden-return')!.categories[0]!;
    expect(back.rows).toMatchObject([{ taskId: 'quistis-card', secondChance: true }]);
  });
});
