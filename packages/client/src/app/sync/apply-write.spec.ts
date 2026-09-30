import { progressFromDto } from '@sweep/core';
import { lanternKeepPayload } from '../../testing/lantern-keep';
import { applyToPayload, applyToProgress } from './apply-write';
import { isQueuedWrite } from './queued-write';

describe('applying writes', () => {
  it('folds writes into progress exactly as the server applies them', () => {
    const base = progressFromDto(lanternKeepPayload({ pin: 'village' }).progress);
    const after = [
      { kind: 'task', runId: 'r', taskId: 'lost-cat', state: 'done' },
      { kind: 'section', runId: 'r', sectionId: 'village', cleared: true },
      { kind: 'category', runId: 'r', categoryId: 'lore', tracked: true },
    ] as const;
    const p = after.reduce(applyToProgress, base);
    expect(p.tasks.get('lost-cat')).toBe('done');
    expect(p.cleared.has('village')).toBe(true);
    expect(p.pin).toBeNull(); // clearing the pinned leaf removes the pin (§4.5)
    expect(p.tracked.get('lore')).toBe(true);
  });

  it('updates the stored server copy of the right run only', () => {
    const payload = lanternKeepPayload();
    const renamed = applyToPayload(payload, {
      kind: 'run-name',
      runId: payload.run.id,
      name: 'Renamed',
    });
    expect(renamed.run.name).toBe('Renamed');
    const other = applyToPayload(payload, {
      kind: 'task',
      runId: 'someone-else',
      taskId: 'lost-cat',
      state: 'done',
    });
    expect(other).toBe(payload);
    const done = applyToPayload(payload, {
      kind: 'task',
      runId: payload.run.id,
      taskId: 'lost-cat',
      state: 'done',
    });
    expect(done.progress.tasks).toEqual({ 'lost-cat': 'done' });
  });

  it('validates stored writes', () => {
    expect(isQueuedWrite({ kind: 'pin', runId: 'r', sectionId: null })).toBe(true);
    expect(isQueuedWrite({ kind: 'task', runId: 'r', taskId: 't', state: 'nope' })).toBe(false);
    expect(isQueuedWrite({ kind: 'section', runId: 'r', sectionId: 's' })).toBe(false);
    expect(isQueuedWrite('junk')).toBe(false);
  });
});
