import {
  DOCUMENT,
  DestroyRef,
  InjectionToken,
  Service,
  computed,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { isRetryable, toApiError, type ApiError } from '../api/api-error';
import { RunsApi } from '../api/runs-api';
import { SafeStorage } from '../shared/safe-storage';
import { isQueuedWrite, writeKey, type QueuedWrite } from './queued-write';

export const BACKOFF_MIN_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;

/** Delay before retry number `attempt` (1-based): 1 s, 2 s, 4 s … capped at 60 s (spec §5.7). */
export function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, attempt - 1));
}

export function queueStorageKey(userId: string): string {
  return `sweep.queue.${userId}`;
}

export type WriteSender = (write: QueuedWrite) => Promise<void>;

export async function sendWrite(api: RunsApi, write: QueuedWrite): Promise<void> {
  switch (write.kind) {
    case 'section':
      return api.setSection(write.runId, write.sectionId, write.cleared);
    case 'pin':
      return api.setPin(write.runId, write.sectionId);
    case 'task':
      return api.setTask(write.runId, write.taskId, write.state);
    case 'category':
      return api.setCategory(write.runId, write.categoryId, write.tracked);
    case 'run-name':
      await api.renameRun(write.runId, write.name);
      return;
  }
}

export const WRITE_SENDER = new InjectionToken<WriteSender>('WRITE_SENDER', {
  providedIn: 'root',
  factory: () => {
    const api = inject(RunsApi);
    return (write) => sendWrite(api, write);
  },
});

export interface WriteQueueListener {
  applied?(write: QueuedWrite): void;
  dropped?(write: QueuedWrite, error: ApiError): void;
}

interface Entry {
  readonly seq: number;
  readonly write: QueuedWrite;
}

/** The optimistic-write retry queue. Rules: "Retry queue semantics" in the client plan. */
@Service()
export class WriteQueue {
  private readonly send = inject(WRITE_SENDER);
  private readonly storage = inject(SafeStorage);
  private readonly entries = signal<readonly Entry[]>([]);
  private readonly listeners = new Set<WriteQueueListener>();
  private readonly discarded = new Set<string>();
  private userId: string | null = null;
  private seq = 0;
  private generation = 0;
  private inFlight: Entry | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private idle: (() => void)[] = [];

  /** Every queued write in order, the one in flight first. */
  readonly pending: Signal<readonly QueuedWrite[]> = computed(() =>
    this.entries().map((e) => e.write),
  );
  readonly size: Signal<number> = computed(() => this.entries().length);
  /** Waiting on a backoff timer, or paused until the user signs in again. */
  readonly stalled = signal(false);

  constructor() {
    const doc = inject(DOCUMENT);
    const win = doc.defaultView;
    const kick = (): void => this.retryNow();
    const onVisible = (): void => {
      if (doc.visibilityState === 'visible') this.retryNow();
    };
    win?.addEventListener('online', kick);
    win?.addEventListener('focus', kick);
    doc.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      win?.removeEventListener('online', kick);
      win?.removeEventListener('focus', kick);
      doc.removeEventListener('visibilitychange', onVisible);
      this.stopTimer();
      this.generation += 1;
    });
  }

  listen(listener: WriteQueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Loads `userId`'s persisted queue (null: nobody signed in). The same user resumes a paused queue. */
  setUser(userId: string | null): void {
    if (userId === this.userId) {
      if (this.paused) {
        this.paused = false;
        this.stalled.set(false);
        this.pump();
      }
      return;
    }
    this.generation += 1;
    this.stopTimer();
    this.inFlight = null;
    this.attempt = 0;
    this.paused = false;
    this.stalled.set(false);
    this.userId = userId;
    const stored = userId === null ? null : this.storage.read<unknown>(queueStorageKey(userId));
    const writes = Array.isArray(stored) ? stored.filter(isQueuedWrite) : [];
    this.entries.set(writes.map((write) => ({ seq: ++this.seq, write })));
    this.resolveIdle();
    this.pump();
  }

  enqueue(write: QueuedWrite): void {
    if (this.userId === null) throw new Error('WriteQueue.enqueue: nobody is signed in');
    const key = writeKey(write);
    this.entries.update((list) => {
      const i = list.findIndex((e) => e !== this.inFlight && writeKey(e.write) === key);
      if (i === -1) return [...list, { seq: ++this.seq, write }];
      const next = [...list];
      next[i] = { seq: list[i]!.seq, write };
      return next;
    });
    this.persist();
    this.pump();
  }

  /** Resolves when the queue is empty, or as soon as it stalls (backoff, paused, signed out). */
  flush(): Promise<void> {
    this.retryNow();
    if (this.entries().length === 0 || this.paused || this.userId === null)
      return Promise.resolve();
    return new Promise((resolve) => this.idle.push(resolve));
  }

  retryNow(): void {
    if (this.paused) return;
    this.stopTimer();
    this.pump();
  }

  /** The run was deleted: forget its writes; ignore the outcome of one already in flight. */
  discardRun(runId: string): void {
    this.discarded.add(runId);
    this.removeWhere((e) => e !== this.inFlight && e.write.runId === runId);
  }

  private pump(): void {
    if (this.inFlight !== null || this.paused || this.timer !== null) return;
    const head = this.entries()[0];
    if (head === undefined) {
      this.resolveIdle();
      return;
    }
    this.inFlight = head;
    const generation = this.generation;
    this.send(head.write).then(
      () => {
        if (generation === this.generation) this.succeeded(head);
      },
      (err: unknown) => {
        if (generation === this.generation) this.failed(head, toApiError(err));
      },
    );
  }

  private succeeded(entry: Entry): void {
    this.inFlight = null;
    this.attempt = 0;
    this.stalled.set(false);
    this.removeWhere((e) => e === entry);
    if (!this.discarded.has(entry.write.runId)) this.emit((l) => l.applied?.(entry.write));
    this.pump();
  }

  private failed(entry: Entry, error: ApiError): void {
    this.inFlight = null;
    if (this.discarded.has(entry.write.runId)) {
      this.removeWhere((e) => e === entry);
      this.pump();
      return;
    }
    if (error.status === 401) {
      this.paused = true;
      this.stalled.set(true);
      this.resolveIdle();
      return;
    }
    if (isRetryable(error)) {
      this.attempt += 1;
      this.stalled.set(true);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pump();
      }, backoffDelay(this.attempt));
      this.resolveIdle();
      return;
    }
    const runId = entry.write.runId;
    const dropped =
      error.status === 404 ? this.entries().filter((e) => e.write.runId === runId) : [entry];
    this.removeWhere((e) => dropped.includes(e));
    this.attempt = 0;
    this.stalled.set(false);
    for (const e of dropped) this.emit((l) => l.dropped?.(e.write, error));
    this.pump();
  }

  private removeWhere(predicate: (e: Entry) => boolean): void {
    this.entries.update((list) => list.filter((e) => !predicate(e)));
    this.persist();
  }

  private persist(): void {
    if (this.userId === null) return;
    const key = queueStorageKey(this.userId);
    const writes = this.entries().map((e) => e.write);
    if (writes.length === 0) this.storage.remove(key);
    else this.storage.write(key, writes);
  }

  private emit(call: (listener: WriteQueueListener) => void): void {
    for (const listener of this.listeners) call(listener);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private resolveIdle(): void {
    const waiting = this.idle;
    this.idle = [];
    for (const resolve of waiting) resolve();
  }
}
