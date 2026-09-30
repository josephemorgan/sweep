import { DOCUMENT, DestroyRef, Service, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  clearImpact,
  deriveMetricTasks,
  deriveRun,
  indexGuide,
  progressFromDto,
  type ClearImpact,
  type ClosingTask,
  type Guide,
  type GuideIndex,
  type MetricTasks,
  type Metrics,
  type RunDto,
  type RunPayloadDto,
  type RunProgress,
  type RunView,
  type TaskState,
} from '@sweep/core';
import { toApiError, type ApiError } from '../api/api-error';
import { RunsApi } from '../api/runs-api';
import { Toasts } from '../shared/toasts';
import { applyToPayload, applyToProgress } from '../sync/apply-write';
import type { QueuedWrite } from '../sync/queued-write';
import { WriteQueue } from '../sync/write-queue';
import { ResumeCache } from './resume-cache';

export const RunStatus = {
  Idle: 'idle',
  Loading: 'loading',
  Ready: 'ready',
  NotFound: 'not-found',
  Failed: 'failed',
} as const;
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

/** The resume cache re-serializes the whole guide, so writes to it are batched. */
export const CACHE_DEBOUNCE_MS = 500;

type RenameWrite = Extract<QueuedWrite, { kind: 'run-name' }>;

/**
 * The open run. Holds the server payload; everything shown is derived with computed() over
 * @sweep/core from "server progress + pending writes" (spec §4.12, retry queue rule 4).
 */
@Service()
export class RunStore {
  private readonly api = inject(RunsApi);
  private readonly queue = inject(WriteQueue);
  private readonly cache = inject(ResumeCache);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);
  private readonly payload = signal<RunPayloadDto | null>(null);
  private cacheDue: RunPayloadDto | null = null;
  private cacheTimer: ReturnType<typeof setTimeout> | null = null;

  readonly runId = signal<string | null>(null);
  readonly status = signal<RunStatus>(RunStatus.Idle);
  readonly revalidating = signal(false);
  readonly offline = signal(false);
  readonly categoryFilter = signal<string | null>(null);

  private readonly pendingHere = computed(() => {
    const id = this.runId();
    return this.queue.pending().filter((w) => w.runId === id);
  });

  readonly guide = computed<Guide | null>(() => this.payload()?.guide ?? null);
  readonly index = computed<GuideIndex | null>(() => {
    const guide = this.guide();
    return guide ? indexGuide(guide) : null;
  });
  readonly progress = computed<RunProgress | null>(() => {
    const p = this.payload();
    return p ? this.pendingHere().reduce(applyToProgress, progressFromDto(p.progress)) : null;
  });
  readonly run = computed<RunDto | null>(() => {
    const p = this.payload();
    if (!p) return null;
    const rename = this.pendingHere()
      .filter((w): w is RenameWrite => w.kind === 'run-name')
      .at(-1);
    return rename ? { ...p.run, name: rename.name } : p.run;
  });
  readonly view = computed<RunView | null>(() => {
    const guide = this.guide();
    const progress = this.progress();
    return guide && progress ? deriveRun(guide, progress) : null;
  });
  private readonly trackedTasks = computed(() => this.metricTasksFor(null));
  readonly metricTasks = computed<MetricTasks | null>(() => {
    const filter = this.categoryFilter();
    return filter === null ? this.trackedTasks() : this.metricTasksFor(filter);
  });
  readonly metrics = computed<Metrics | null>(() => {
    const t = this.metricTasks();
    return (
      t && {
        here: t.here.length,
        now: t.now.length,
        closing: t.closing.length,
        lastChance: t.lastChance.length,
      }
    );
  });
  /** LAST CHANCE over every tracked category, for the task-row badge (§5.2). */
  readonly lastChanceIds = computed<ReadonlySet<string>>(
    () => new Set(this.trackedTasks()?.lastChance.map((c) => c.taskId) ?? []),
  );

  constructor() {
    const stop = this.queue.listen({
      applied: (write) => {
        const p = this.payload();
        if (p && write.runId === p.run.id) this.setPayload(applyToPayload(p, write));
      },
      dropped: (write, error) => this.onDropped(write, error),
    });
    const doc = inject(DOCUMENT);
    const win = doc.defaultView;
    const onFocus = (): void => {
      if (doc.visibilityState !== 'hidden') void this.revalidate();
    };
    const onHidden = (): void => {
      if (doc.visibilityState === 'hidden') this.flushCache();
    };
    const onPageHide = (): void => this.flushCache();
    win?.addEventListener('focus', onFocus);
    win?.addEventListener('pagehide', onPageHide);
    doc.addEventListener('visibilitychange', onFocus);
    doc.addEventListener('visibilitychange', onHidden);
    inject(DestroyRef).onDestroy(() => {
      stop();
      this.flushCache();
      win?.removeEventListener('focus', onFocus);
      win?.removeEventListener('pagehide', onPageHide);
      doc.removeEventListener('visibilitychange', onFocus);
      doc.removeEventListener('visibilitychange', onHidden);
    });
  }

  /** Shows the cached copy at once when there is one, then loads the server copy (spec §5.7). */
  async open(runId: string): Promise<void> {
    if (this.runId() !== runId) {
      this.flushCache();
      this.runId.set(runId);
      this.payload.set(null);
      this.categoryFilter.set(null);
      this.offline.set(false);
      const cached = this.cache.read(runId);
      if (cached) this.payload.set(cached);
    }
    this.status.set(this.payload() ? RunStatus.Ready : RunStatus.Loading);
    await this.refetch();
  }

  /** Replaces only the server copy; pending writes stay folded on top (rule 4). */
  async refetch(): Promise<void> {
    const runId = this.runId();
    if (runId === null) return;
    this.revalidating.set(true);
    try {
      const fresh = await this.api.getRun(runId);
      if (this.runId() !== runId) return;
      this.setPayload(fresh);
      this.offline.set(false);
      this.status.set(RunStatus.Ready);
    } catch (err) {
      if (this.runId() !== runId) return;
      const e = toApiError(err);
      if (e.status === 404) {
        this.gone(runId);
      } else if (e.isNetwork) {
        this.offline.set(true);
        if (!this.payload()) this.status.set(RunStatus.Failed);
      } else if (e.status !== 401) {
        if (!this.payload()) this.status.set(RunStatus.Failed);
        else this.toasts.show(`Couldn't refresh this run. ${e.message}`, { key: 'refresh' });
      }
    } finally {
      if (this.runId() === runId) this.revalidating.set(false);
    }
  }

  /** Spec §5.7 "Multiple devices": flush the queue, then refetch. */
  async revalidate(): Promise<void> {
    if (this.runId() === null || this.revalidating()) return;
    await this.queue.flush();
    await this.refetch();
  }

  close(): void {
    this.flushCache();
    this.runId.set(null);
    this.payload.set(null);
    this.status.set(RunStatus.Idle);
  }

  setTaskState(taskId: string, state: TaskState | null): void {
    this.queue.enqueue({ kind: 'task', runId: this.requireRun(), taskId, state });
  }

  /** Clearing the pinned leaf queues `pin: null` first, so coalescing can't leave the pin behind (rule 3). */
  setCleared(leafId: string, cleared: boolean): void {
    const runId = this.requireRun();
    if (cleared && this.progress()?.pin === leafId) {
      this.queue.enqueue({ kind: 'pin', runId, sectionId: null });
    }
    this.queue.enqueue({ kind: 'section', runId, sectionId: leafId, cleared });
  }

  setPin(leafId: string | null): void {
    this.queue.enqueue({ kind: 'pin', runId: this.requireRun(), sectionId: leafId });
  }

  /** Stores an override only when it differs from the guide default (null resets). */
  setTracked(categoryId: string, tracked: boolean): void {
    const runId = this.requireRun();
    const fallback = this.guide()?.categories.find((c) => c.id === categoryId)?.tracked;
    this.queue.enqueue({
      kind: 'category',
      runId,
      categoryId,
      tracked: fallback === tracked ? null : tracked,
    });
    if (!tracked && this.categoryFilter() === categoryId) this.categoryFilter.set(null);
  }

  rename(name: string): void {
    this.queue.enqueue({ kind: 'run-name', runId: this.requireRun(), name });
  }

  /** clearImpact, filtered to tracked categories (spec §5.4). */
  impactOf(leafId: string): ClearImpact | null {
    const guide = this.guide();
    const progress = this.progress();
    const view = this.view();
    const index = this.index();
    if (!guide || !progress || !view || !index) return null;
    const impact = clearImpact(guide, progress, leafId);
    const tracked = (c: ClosingTask): boolean =>
      view.tracked.has(index.tasks.get(c.taskId)!.category);
    return {
      ...impact,
      closing: impact.closing.filter(tracked),
      lastChance: impact.lastChance.filter(tracked),
    };
  }

  /** After a guide update was applied: the new payload is the server copy. */
  replacePayload(payload: RunPayloadDto): void {
    if (payload.run.id !== this.runId()) return;
    this.setPayload(payload);
    this.status.set(RunStatus.Ready);
  }

  private metricTasksFor(category: string | null): MetricTasks | null {
    const guide = this.guide();
    const progress = this.progress();
    const view = this.view();
    return guide && progress && view ? deriveMetricTasks(guide, progress, view, category) : null;
  }

  private setPayload(payload: RunPayloadDto): void {
    this.payload.set(payload);
    this.cacheDue = payload;
    if (this.cacheTimer !== null) clearTimeout(this.cacheTimer);
    this.cacheTimer = setTimeout(() => this.flushCache(), CACHE_DEBOUNCE_MS);
  }

  /** Writes the latest server payload to the resume cache now. A full cache is fine: the queue persists separately. */
  private flushCache(): void {
    if (this.cacheTimer !== null) {
      clearTimeout(this.cacheTimer);
      this.cacheTimer = null;
    }
    const due = this.cacheDue;
    this.cacheDue = null;
    if (due) this.cache.write(due);
  }

  private dropCache(): void {
    if (this.cacheTimer !== null) clearTimeout(this.cacheTimer);
    this.cacheTimer = null;
    this.cacheDue = null;
  }

  private onDropped(write: QueuedWrite, error: ApiError): void {
    if (write.runId !== this.runId()) {
      this.toasts.show(`A change to another run couldn't be saved. ${error.message}`, {
        key: 'dropped',
      });
      return;
    }
    if (error.status === 404) {
      this.gone(write.runId);
      return;
    }
    this.toasts.show(
      `A change couldn't be saved. ${error.message} Showing the latest saved state.`,
      { key: 'dropped' },
    );
    void this.refetch();
  }

  private gone(runId: string): void {
    if (this.status() === RunStatus.NotFound) return;
    this.dropCache();
    this.cache.forget(runId);
    this.queue.discardRun(runId);
    this.payload.set(null);
    this.status.set(RunStatus.NotFound);
    this.toasts.show('This run no longer exists.', { key: 'gone' });
    void this.router.navigateByUrl('/runs');
  }

  private requireRun(): string {
    const runId = this.runId();
    if (runId === null) throw new Error('RunStore: no run is open');
    return runId;
  }
}
