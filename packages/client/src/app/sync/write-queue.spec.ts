import { TestBed } from '@angular/core/testing';
import type { TaskState } from '@sweep/core';
import { createRunsApiFake } from '../../testing/fake-runs-api';
import { FakeSender } from '../../testing/fake-sender';
import { ApiError } from '../api/api-error';
import type { RunsApi } from '../api/runs-api';
import { writeKey, type QueuedWrite } from './queued-write';
import { WRITE_SENDER, WriteQueue, backoffDelay, queueStorageKey, sendWrite } from './write-queue';

const task = (taskId: string, state: TaskState | null, runId = 'r1'): QueuedWrite => ({
  kind: 'task',
  runId,
  taskId,
  state,
});
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};
const stored = (userId: string): unknown =>
  JSON.parse(localStorage.getItem(queueStorageKey(userId)) ?? 'null');

function setup(userId: string | null = 'u1') {
  const sender = new FakeSender();
  TestBed.configureTestingModule({ providers: [{ provide: WRITE_SENDER, useValue: sender.send }] });
  const queue = TestBed.inject(WriteQueue);
  queue.setUser(userId);
  return { queue, sender };
}

describe('WriteQueue (see "Retry queue semantics")', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rule 3: sends in order, one at a time, and reports each applied write', async () => {
    const { queue, sender } = setup();
    const applied = vi.fn();
    queue.listen({ applied });
    queue.enqueue(task('a', 'done'));
    queue.enqueue(task('b', 'done'));
    expect(sender.sent.map((s) => s.write)).toEqual([task('a', 'done')]);
    sender.sent[0]!.resolve();
    await settle();
    expect(applied).toHaveBeenCalledWith(task('a', 'done'));
    expect(sender.sent.map((s) => s.write)).toEqual([task('a', 'done'), task('b', 'done')]);
    sender.sent[1]!.resolve();
    await settle();
    expect(queue.size()).toBe(0);
    expect(stored('u1')).toBeNull();
  });

  it('rule 3: coalesces a pending write in place, never the one in flight', () => {
    const { queue } = setup();
    queue.enqueue(task('a', 'done')); // in flight
    queue.enqueue(task('b', 'done'));
    queue.enqueue(task('c', 'done'));
    queue.enqueue(task('b', 'dont-care'));
    queue.enqueue(task('a', null));
    expect(queue.pending()).toEqual([
      task('a', 'done'),
      task('b', 'dont-care'),
      task('c', 'done'),
      task('a', null),
    ]);
  });

  it('rule 3: ten offline toggles of one checkbox leave one write (Review Focus 2)', async () => {
    const { queue, sender } = setup();
    queue.enqueue(task('x', 'done'));
    sender.sent[0]!.reject(new ApiError(0, 'network', 'offline'));
    await settle();
    for (let i = 0; i < 10; i += 1) queue.enqueue(task('x', i % 2 === 0 ? null : 'done'));
    expect(queue.pending()).toEqual([task('x', 'done')]);
  });

  it('rule 2: keys by kind, run and target', () => {
    expect(writeKey({ kind: 'section', runId: 'r1', sectionId: 'village', cleared: true })).toBe(
      'section:r1:village',
    );
    expect(writeKey({ kind: 'pin', runId: 'r1', sectionId: null })).toBe('pin:r1');
    expect(writeKey(task('lost-cat', 'done'))).toBe('task:r1:lost-cat');
    expect(writeKey({ kind: 'category', runId: 'r1', categoryId: 'lore', tracked: true })).toBe(
      'category:r1:lore',
    );
    expect(writeKey({ kind: 'run-name', runId: 'r1', name: 'x' })).toBe('run-name:r1');
  });

  it('rule 5: retries 0, 503, 408 and 429 with backoff from 1 s up to 60 s', async () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(backoffDelay)).toEqual([
      1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000,
    ]);
    const { queue, sender } = setup();
    queue.enqueue(task('a', 'done'));
    for (const [i, status] of [0, 503, 408, 429].entries()) {
      sender.sent[i]!.reject(new ApiError(status, 'x', 'x'));
      await settle();
      expect(queue.stalled()).toBe(true);
      await vi.advanceTimersByTimeAsync(backoffDelay(i + 1) - 1);
      expect(sender.sent).toHaveLength(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(sender.sent).toHaveLength(i + 2);
    }
    sender.sent[4]!.resolve();
    await settle();
    expect(queue.size()).toBe(0);
    expect(queue.stalled()).toBe(false);
  });

  it('rule 5: retries at once on online and on focus', async () => {
    const { queue, sender } = setup();
    queue.enqueue(task('a', 'done'));
    sender.sent[0]!.reject(new ApiError(0, 'network', 'x'));
    await settle();
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(sender.sent).toHaveLength(2);
    sender.sent[1]!.reject(new ApiError(0, 'network', 'x'));
    await settle();
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(sender.sent).toHaveLength(3);
  });

  it('rules 8 and 9: drops a 422 or 400 write, tells listeners and carries on (Review Focus 3)', async () => {
    const { queue, sender } = setup();
    const dropped = vi.fn();
    queue.listen({ dropped });
    queue.enqueue(task('renamed-elsewhere', 'done'));
    queue.enqueue(task('b', 'done'));
    const gone = new ApiError(422, 'unknown-id', 'No such task in the current guide.');
    sender.sent[0]!.reject(gone);
    await settle();
    expect(dropped).toHaveBeenCalledWith(task('renamed-elsewhere', 'done'), gone);
    expect(sender.sent[1]!.write).toEqual(task('b', 'done'));
    sender.sent[1]!.reject(new ApiError(400, 'bad-request', 'Malformed request.'));
    await settle();
    expect(queue.size()).toBe(0);
    expect(dropped).toHaveBeenCalledTimes(2);
  });

  it('rule 7: a 404 drops every write for that run and keeps other runs', async () => {
    const { queue, sender } = setup();
    const dropped = vi.fn();
    queue.listen({ dropped });
    queue.enqueue(task('a', 'done', 'deleted'));
    queue.enqueue(task('b', 'done', 'r2'));
    queue.enqueue(task('c', 'done', 'deleted'));
    sender.sent[0]!.reject(new ApiError(404, 'not-found', 'No such run.'));
    await settle();
    expect(dropped).toHaveBeenCalledTimes(2);
    expect(queue.pending()).toEqual([task('b', 'done', 'r2')]);
  });

  it('rule 6: a 401 pauses and keeps the queue until the same user is back (Review Focus 4)', async () => {
    const { queue, sender } = setup('u1');
    queue.enqueue(task('a', 'done'));
    sender.sent[0]!.reject(new ApiError(401, 'unauthorized', 'Sign in to continue.'));
    await settle();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sender.sent).toHaveLength(1);
    expect(stored('u1')).toEqual([task('a', 'done')]);
    queue.setUser(null);
    expect(queue.size()).toBe(0);
    expect(stored('u1')).toEqual([task('a', 'done')]);
    queue.setUser('u1');
    await settle();
    expect(sender.sent[1]!.write).toEqual(task('a', 'done'));
  });

  it('rule 13: persists per user and restores in a new app instance', () => {
    const first = setup('u1').queue;
    first.enqueue(task('a', 'done'));
    first.enqueue(task('b', 'done'));
    expect(stored('u1')).toEqual([task('a', 'done'), task('b', 'done')]);
    TestBed.resetTestingModule();
    const { queue, sender } = setup('u2');
    expect(queue.size()).toBe(0);
    queue.setUser('u1');
    expect(queue.pending()).toEqual([task('a', 'done'), task('b', 'done')]);
    expect(sender.sent[0]!.write).toEqual(task('a', 'done'));
  });

  it('rule 13: skips corrupt stored entries', () => {
    localStorage.setItem(
      queueStorageKey('u1'),
      JSON.stringify([{ kind: 'task' }, task('ok', 'done'), 'junk']),
    );
    const { queue } = setup('u1');
    expect(queue.pending()).toEqual([task('ok', 'done')]);
  });

  it('rule 13: works in memory when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { queue, sender } = setup();
    queue.enqueue(task('a', 'done'));
    sender.sent[0]!.resolve();
    await settle();
    expect(queue.size()).toBe(0);
  });

  it('rule 14: flush resolves once empty, or as soon as the queue stalls', async () => {
    const { queue, sender } = setup();
    queue.enqueue(task('a', 'done'));
    const emptied = vi.fn();
    void queue.flush().then(emptied);
    await settle();
    expect(emptied).not.toHaveBeenCalled();
    sender.sent[0]!.resolve();
    await settle();
    expect(emptied).toHaveBeenCalled();

    queue.enqueue(task('b', 'done'));
    const stalled = vi.fn();
    void queue.flush().then(stalled);
    sender.sent[1]!.reject(new ApiError(503, 'x', 'x'));
    await settle();
    expect(stalled).toHaveBeenCalled();
    expect(queue.size()).toBe(1);
  });

  it('rule 11: discardRun forgets a deleted run silently, even a write in flight', async () => {
    const { queue, sender } = setup();
    const dropped = vi.fn();
    const applied = vi.fn();
    queue.listen({ dropped, applied });
    queue.enqueue(task('a', 'done'));
    queue.enqueue(task('b', 'done'));
    queue.discardRun('r1');
    expect(queue.pending()).toEqual([task('a', 'done')]);
    sender.sent[0]!.reject(new ApiError(404, 'not-found', 'No such run.'));
    await settle();
    expect(queue.size()).toBe(0);
    expect(dropped).not.toHaveBeenCalled();
    expect(applied).not.toHaveBeenCalled();
  });

  it('ignores a late answer for the previous user after switching', async () => {
    const { queue, sender } = setup('u1');
    const applied = vi.fn();
    queue.listen({ applied });
    queue.enqueue(task('a', 'done'));
    queue.setUser('u2');
    sender.sent[0]!.resolve();
    await settle();
    expect(applied).not.toHaveBeenCalled();
    expect(stored('u1')).toEqual([task('a', 'done')]);
  });
  it('rule 9: drops any other 4xx (400, 403, 409, 413) without retrying', async () => {
    const { queue, sender } = setup();
    const dropped = vi.fn();
    queue.listen({ dropped });
    for (const status of [403, 409, 413]) queue.enqueue(task(`t${status}`, 'done'));
    for (const [i, status] of [403, 409, 413].entries()) {
      sender.sent[i]!.reject(new ApiError(status, 'x', 'x'));
      await settle();
    }
    expect(dropped).toHaveBeenCalledTimes(3);
    expect(queue.size()).toBe(0);
    expect(queue.stalled()).toBe(false);
    expect(sender.sent).toHaveLength(3);
  });

  it('rule 1: sendWrite maps each kind to its RunsApi call', async () => {
    const api = createRunsApiFake();
    api.setSection.mockResolvedValue(undefined);
    api.setPin.mockResolvedValue(undefined);
    api.setTask.mockResolvedValue(undefined);
    api.setCategory.mockResolvedValue(undefined);
    api.renameRun.mockResolvedValue({} as never);
    const runs = api as unknown as RunsApi;
    await sendWrite(runs, { kind: 'section', runId: 'r', sectionId: 's', cleared: true });
    await sendWrite(runs, { kind: 'pin', runId: 'r', sectionId: null });
    await sendWrite(runs, task('t', 'done'));
    await sendWrite(runs, { kind: 'category', runId: 'r', categoryId: 'c', tracked: false });
    await sendWrite(runs, { kind: 'run-name', runId: 'r', name: 'n' });
    expect(api.setSection).toHaveBeenCalledWith('r', 's', true);
    expect(api.setPin).toHaveBeenCalledWith('r', null);
    expect(api.setTask).toHaveBeenCalledWith('r1', 't', 'done');
    expect(api.setCategory).toHaveBeenCalledWith('r', 'c', false);
    expect(api.renameRun).toHaveBeenCalledWith('r', 'n');
  });
  it('rule 3: after a failed send, a new write coalesces into the last duplicate', async () => {
    const { queue, sender } = setup();
    queue.enqueue(task('x', 'done')); // in flight
    queue.enqueue(task('x', null)); // appended behind it
    sender.sent[0]!.reject(new ApiError(0, 'network', 'offline'));
    await settle();
    queue.enqueue(task('x', 'done'));
    expect(queue.pending()).toEqual([task('x', 'done'), task('x', 'done')]);
    await vi.advanceTimersByTimeAsync(backoffDelay(1));
    sender.sent[1]!.resolve();
    await settle();
    sender.sent[2]!.resolve();
    await settle();
    expect(sender.sent.at(-1)!.write).toEqual(task('x', 'done'));
    expect(queue.size()).toBe(0);
  });

  it('rule 3: a same-key write during a send is appended and sent last', async () => {
    const { queue, sender } = setup();
    queue.enqueue(task('x', 'done')); // in flight
    queue.enqueue(task('x', null));
    queue.enqueue(task('x', 'dont-care')); // coalesces into the appended one
    expect(queue.pending()).toEqual([task('x', 'done'), task('x', 'dont-care')]);
    sender.sent[0]!.resolve();
    await settle();
    expect(sender.sent[1]!.write).toEqual(task('x', 'dont-care'));
    sender.sent[1]!.resolve();
    await settle();
    expect(queue.size()).toBe(0);
  });

  it('rule 11: discardRun of the head waiting in backoff clears the stall and sends the rest', async () => {
    const { queue, sender } = setup();
    queue.enqueue(task('a', 'done', 'r1'));
    queue.enqueue(task('b', 'done', 'r2'));
    sender.sent[0]!.reject(new ApiError(503, 'x', 'x'));
    await settle();
    expect(queue.stalled()).toBe(true);
    queue.discardRun('r1');
    expect(queue.stalled()).toBe(false);
    expect(sender.sent).toHaveLength(2);
    expect(sender.sent[1]!.write).toEqual(task('b', 'done', 'r2'));
  });

  it('rule 5: retries at once when the page becomes visible, not when hidden', async () => {
    const { queue, sender } = setup();
    queue.enqueue(task('a', 'done'));
    sender.sent[0]!.reject(new ApiError(0, 'network', 'x'));
    await settle();
    const state = vi.spyOn(document, 'visibilityState', 'get');
    state.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(sender.sent).toHaveLength(1);
    state.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(sender.sent).toHaveLength(2);
  });

  it('rule 5: a success resets the backoff to 1 s', async () => {
    const { queue, sender } = setup();
    queue.enqueue(task('a', 'done'));
    sender.sent[0]!.reject(new ApiError(503, 'x', 'x'));
    await settle();
    await vi.advanceTimersByTimeAsync(backoffDelay(1));
    sender.sent[1]!.reject(new ApiError(503, 'x', 'x'));
    await settle();
    await vi.advanceTimersByTimeAsync(backoffDelay(2));
    sender.sent[2]!.resolve();
    await settle();
    queue.enqueue(task('b', 'done'));
    sender.sent[3]!.reject(new ApiError(503, 'x', 'x'));
    await settle();
    await vi.advanceTimersByTimeAsync(999);
    expect(sender.sent).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(sender.sent).toHaveLength(5);
  });

  it('a sender that throws synchronously is treated as a failed send', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: WRITE_SENDER,
          useValue: () => {
            throw new Error('boom');
          },
        },
      ],
    });
    const queue = TestBed.inject(WriteQueue);
    queue.setUser('u1');
    queue.enqueue(task('a', 'done'));
    await settle();
    expect(queue.stalled()).toBe(true);
    expect(queue.size()).toBe(1);
  });
});
