import type { CardCategory, TaskStatus } from '@sweep/core';
import { indexGuide, deriveRun, emptyProgress } from '@sweep/core';
import { LANTERN_KEEP } from '../../testing/lantern-keep';
import { lockReason } from './lock-reason';
import { stickyCategories } from './sticky-rows';

const missed: TaskStatus = { kind: 'missed', nextChance: 'epilogue' };
const cat = (categoryId: string, rows: CardCategory['rows']): CardCategory => ({
  categoryId,
  rows,
  done: 0,
  total: 0,
  missed: 0,
});

describe('stickyCategories (§5.3: rows never jump out from under the finger)', () => {
  it('keeps a resolved 2nd-chance row in place with its fresh status', () => {
    const shown = [cat('quests', [{ taskId: 'lost-cat', status: missed, secondChance: true }])];
    const next = [cat('quests', [{ taskId: 'new-one', status: missed, secondChance: false }])];
    const out = stickyCategories(shown, next, () => ({ kind: 'done' }), new Set(['quests']));
    expect(out[0]!.rows).toEqual([
      { taskId: 'lost-cat', status: { kind: 'done' }, secondChance: true },
      { taskId: 'new-one', status: missed, secondChance: false },
    ]);
  });

  it('keeps a tracked category whose last row dropped out; drops an untracked one', () => {
    const shown = [
      cat('quests', [{ taskId: 'lost-cat', status: missed, secondChance: true }]),
      cat('lore', [{ taskId: 'keep-history', status: missed, secondChance: true }]),
    ];
    const out = stickyCategories(shown, [], () => ({ kind: 'done' }), new Set(['quests']));
    expect(out.map((c) => c.categoryId)).toEqual(['quests']);
  });
});

describe('lockReason', () => {
  const index = indexGuide(LANTERN_KEEP);
  it('names the first unmet gate from the outermost group down', () => {
    const view = deriveRun(LANTERN_KEEP, emptyProgress());
    expect(lockReason(index, view, 'epilogue')).toEqual({ mode: 'all', ids: ['throne-room'] });
    expect(lockReason(index, view, 'west-tower')).toEqual({ mode: 'all', ids: ['keep-gate'] });
    expect(lockReason(index, view, 'village')).toBeNull();
  });
});
