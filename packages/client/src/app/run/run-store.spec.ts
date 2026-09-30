import { TestBed } from '@angular/core/testing';
import { ApiError } from '../api/api-error';
import { Toasts } from '../shared/toasts';
import { queueStorageKey } from '../sync/write-queue';
import { RUN_ID, TEST_USER, lanternKeepPayload } from '../../testing/lantern-keep';
import { setupRunStore } from '../../testing/run-store-harness';
import { ResumeCache, resumeKey } from './resume-cache';

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('RunStore', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('derives the view and metrics from the payload (§4.9)', async () => {
    const { store } = await setupRunStore();
    expect(store.status()).toBe('ready');
    expect(store.view()?.current).toBe('village');
    expect(store.metrics()).toEqual({ here: 3, now: 3, closing: 2, lastChance: 1 });
    expect([...store.lastChanceIds()]).toEqual(['ferry-passage']);
  });

  it('applies a write at once, queues it, and keeps it after the server accepts it', async () => {
    const { store, sender, queue } = await setupRunStore();
    vi.useFakeTimers();
    store.setTaskState('ferry-passage', 'done');
    expect(store.view()?.tasks.get('ferry-passage')).toEqual({ kind: 'done' });
    expect(sender.sent[0]!.write).toEqual({
      kind: 'task',
      runId: RUN_ID,
      taskId: 'ferry-passage',
      state: 'done',
    });
    sender.sent[0]!.resolve();
    await vi.advanceTimersByTimeAsync(600);
    expect(queue.size()).toBe(0);
    expect(store.view()?.tasks.get('ferry-passage')).toEqual({ kind: 'done' });
    expect(TestBed.inject(ResumeCache).read(RUN_ID)?.progress.tasks).toEqual({
      'ferry-passage': 'done',
    });
  });

  it('debounces the resume cache write and flushes it when the page is hidden or unloaded', async () => {
    const { store, sender } = await setupRunStore();
    vi.useFakeTimers();
    const cache = TestBed.inject(ResumeCache);
    const write = vi.spyOn(cache, 'write');
    const cachedTasks = (): unknown => cache.read(RUN_ID)?.progress.tasks;

    store.setTaskState('ferry-passage', 'done');
    sender.sent[0]!.resolve();
    await vi.advanceTimersByTimeAsync(100);
    store.setTaskState('lost-cat', 'done');
    sender.sent[1]!.resolve();
    await vi.advanceTimersByTimeAsync(100);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledTimes(1);
    expect(cachedTasks()).toEqual({ 'ferry-passage': 'done', 'lost-cat': 'done' });

    // visibilitychange -> hidden flushes at once
    store.setTaskState('village-chest', 'done');
    sender.sent[2]!.resolve();
    await vi.advanceTimersByTimeAsync(10);
    expect(cachedTasks()).not.toHaveProperty('village-chest');
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cachedTasks()).toHaveProperty('village-chest');
    expect(write).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(2); // nothing left to flush

    // pagehide flushes too
    store.setTaskState('village-chest', null);
    sender.sent[3]!.resolve();
    await vi.advanceTimersByTimeAsync(10);
    window.dispatchEvent(new Event('pagehide'));
    expect(cachedTasks()).not.toHaveProperty('village-chest');
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('keeps working, and keeps queueing, when the resume cache is full (Review Focus 1, rule 13)', async () => {
    const { store, sender, queue } = await setupRunStore();
    vi.useFakeTimers();
    const cache = TestBed.inject(ResumeCache);
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === resumeKey(TEST_USER.id) && value.length > 200) {
        throw new DOMException('full', 'QuotaExceededError');
      }
      real.call(this, key, value);
    });
    const write = vi.spyOn(cache, 'write');

    store.setTaskState('lost-cat', 'done');
    // The queue persisted the write even though the cache is full.
    expect(localStorage.getItem(queueStorageKey(TEST_USER.id))).toContain('lost-cat');
    sender.sent[0]!.resolve();
    await vi.advanceTimersByTimeAsync(600);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveReturnedWith(false);
    expect(queue.size()).toBe(0);
    expect(store.status()).toBe('ready');
    expect(store.view()?.tasks.get('lost-cat')).toEqual({ kind: 'done' });
    store.setPin('marsh');
    expect(localStorage.getItem(queueStorageKey(TEST_USER.id))).toContain('marsh');
    expect(store.progress()?.pin).toBe('marsh');
  });

  it('keeps pending writes across a refetch (the fold)', async () => {
    const { store, api } = await setupRunStore();
    store.setTaskState('lost-cat', 'done'); // in flight, unanswered
    api.getRun.mockResolvedValue(lanternKeepPayload());
    await store.refetch();
    expect(store.view()?.tasks.get('lost-cat')).toEqual({ kind: 'done' });
  });

  it('never flickers a pending change away while the refetch is in flight (rule 4)', async () => {
    const { store, api } = await setupRunStore();
    store.setTaskState('lost-cat', 'done');
    let answer!: (p: ReturnType<typeof lanternKeepPayload>) => void;
    api.getRun.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const refetching = store.refetch();
    expect(store.view()?.tasks.get('lost-cat')).toEqual({ kind: 'done' });
    answer(lanternKeepPayload({ tasks: {} }));
    await refetching;
    expect(store.view()?.tasks.get('lost-cat')).toEqual({ kind: 'done' });
  });

  it('clearing the pinned leaf queues pin: null first (rule 3)', async () => {
    const { store, queue } = await setupRunStore({ pin: 'village' });
    store.setCleared('village', true);
    expect(queue.pending()).toEqual([
      { kind: 'pin', runId: RUN_ID, sectionId: null },
      { kind: 'section', runId: RUN_ID, sectionId: 'village', cleared: true },
    ]);
    expect(store.view()?.current).toBe('marsh');
  });

  it('sends null when tracking goes back to the guide default, and resets the filter', async () => {
    const { store, queue } = await setupRunStore({ tracked: { loot: false } });
    store.categoryFilter.set('quests');
    store.setTracked('loot', true);
    store.setTracked('quests', false);
    expect(queue.pending().slice(-2)).toEqual([
      { kind: 'category', runId: RUN_ID, categoryId: 'loot', tracked: null },
      { kind: 'category', runId: RUN_ID, categoryId: 'quests', tracked: false },
    ]);
    expect(store.categoryFilter()).toBeNull();
  });

  it('filters metrics by category', async () => {
    const { store } = await setupRunStore();
    store.categoryFilter.set('loot');
    expect(store.metrics()).toEqual({ here: 1, now: 1, closing: 0, lastChance: 0 });
    expect(store.metricTasks()?.now).toEqual(['village-chest']);
  });

  it('filters clear impact to tracked categories', async () => {
    const { store } = await setupRunStore({ tracked: { quests: false } });
    expect(store.impactOf('village')?.closing).toEqual([
      { taskId: 'ferry-passage', nextChance: null },
    ]);
    expect(store.impactOf('epilogue')?.wasLocked).toBe(true);
  });

  it('shows the pending name', async () => {
    const { store } = await setupRunStore();
    store.rename('Second try');
    expect(store.run()?.name).toBe('Second try');
  });

  it('opens from the resume cache at once, then revalidates', async () => {
    const { store, api } = await setupRunStore();
    store.close(); // flushes the debounced write first
    TestBed.inject(ResumeCache).write(lanternKeepPayload({ cleared: ['village'] }));
    let answer!: (p: ReturnType<typeof lanternKeepPayload>) => void;
    api.getRun.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const opening = store.open(RUN_ID);
    expect(store.status()).toBe('ready');
    expect(store.view()?.current).toBe('marsh');
    expect(store.revalidating()).toBe(true);
    answer(lanternKeepPayload({ cleared: ['village', 'marsh'] }));
    await opening;
    expect(store.view()?.current).toBe('keep-gate');
    expect(store.revalidating()).toBe(false);
  });

  it('stays usable offline with the cached copy', async () => {
    const { store, api } = await setupRunStore();
    api.getRun.mockRejectedValue(new ApiError(0, 'network', 'offline'));
    await store.refetch();
    expect(store.offline()).toBe(true);
    expect(store.status()).toBe('ready');
  });

  it('handles a deleted run (404): forgets it and goes to the runs list', async () => {
    const { store, api, router } = await setupRunStore();
    api.getRun.mockRejectedValue(new ApiError(404, 'not-found', 'No such run.'));
    await store.refetch();
    expect(store.status()).toBe('not-found');
    expect(TestBed.inject(ResumeCache).lastRunId()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/runs');
  });

  it('refetches and explains when the server drops a write (Review Focus 3)', async () => {
    const { store, api, sender } = await setupRunStore();
    const show = vi.spyOn(TestBed.inject(Toasts), 'show');
    api.getRun.mockClear();
    store.setTaskState('lost-cat', 'done');
    sender.sent[0]!.reject(new ApiError(422, 'unknown-id', 'No such task in the current guide.'));
    await settle();
    expect(api.getRun).toHaveBeenCalledWith(RUN_ID);
    expect(show.mock.calls[0]![0]).toContain('No such task in the current guide.');
    expect(store.view()?.tasks.get('lost-cat')?.kind).not.toBe('done');
  });

  it('flushes, then refetches, on revalidate (spec §5.7 multiple devices)', async () => {
    const { store, api, sender } = await setupRunStore();
    api.getRun.mockClear();
    store.setTaskState('lost-cat', 'done');
    const revalidating = store.revalidate();
    expect(api.getRun).not.toHaveBeenCalled();
    sender.sent[0]!.resolve();
    await revalidating;
    expect(api.getRun).toHaveBeenCalledTimes(1);
  });
});

describe('RunStore without a run', () => {
  it('refuses writes when no run is open', async () => {
    const { store } = await setupRunStore();
    store.close();
    expect(() => store.setPin('village')).toThrow(/no run is open/);
  });
});
