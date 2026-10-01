import { Component, computed, inject, output, signal } from '@angular/core';
import type { DryRunUpdateResponseDto } from '@sweep/core';
import { isRetryable, toApiError } from '../api/api-error';
import { RunsApi } from '../api/runs-api';
import { guideFileProblem } from '../shared/guide-file';
import { Toasts } from '../shared/toasts';
import { ValidationReport } from '../shared/validation-report';
import { WriteQueue } from '../sync/write-queue';
import { DiffPreview, isEmptyDiff } from './diff-preview';
import { RunStore } from './run-store';

interface Problem {
  message: string;
  retry: boolean;
}

/** §5.8 update flow: pick a file, dry-run it against the run's version, preview, then apply. */
@Component({
  selector: 'app-update-guide-sheet',
  imports: [DiffPreview, ValidationReport],
  template: `
    <div class="flex flex-col gap-3 px-5 pb-5 pt-3">
      @if (unsaved() > 0) {
        <p role="status" class="m-0 text-sm text-fg-muted">
          Waiting for {{ unsaved() }} unsaved {{ unsaved() === 1 ? 'change' : 'changes' }} to save
          before the guide can be updated.
        </p>
      }
      <label class="flex flex-col gap-1 text-sm">
        New guide file (.yaml, .yml or .md)
        <input
          type="file"
          class="field py-2"
          accept=".yaml,.yml,.md"
          [disabled]="unsaved() > 0 || busy()"
          (change)="onFile($event)"
        />
      </label>
      @if (busy()) {
        <p role="status" class="m-0 text-fg-muted">
          {{ step() === 'checking' ? 'Checking the update…' : 'Applying the update…' }}
        </p>
      }
      @if (notice(); as text) {
        <p role="status" class="m-0 rounded-control border border-last-chance p-2 text-sm">
          {{ text }}
        </p>
      }
      @if (problem(); as p) {
        <div
          role="alert"
          class="flex flex-wrap items-center gap-2 rounded-panel border border-missed p-3"
        >
          <p class="m-0 flex-1">{{ p.message }}</p>
          @if (p.retry) {
            <button type="button" class="btn" (click)="retry()">Try again</button>
          }
        </div>
      }
      @if (preview(); as result) {
        <app-validation-report [issues]="result.issues" />
        @if (result.diff; as diff) {
          <app-diff-preview [diff]="diff" />
        }
      }
      @if (preview() || problem()) {
        <div class="flex justify-end gap-2">
          <button type="button" class="btn" (click)="cancelled.emit()">Cancel</button>
          @if (canApply()) {
            <button type="button" class="btn-primary" [disabled]="busy()" (click)="apply()">
              Apply
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class UpdateGuideSheet {
  readonly done = output<void>();
  readonly cancelled = output<void>();
  private readonly api = inject(RunsApi);
  private readonly store = inject(RunStore);
  private readonly queue = inject(WriteQueue);
  private readonly toasts = inject(Toasts);
  private file: File | null = null;
  private baseVersion = 0;
  /** What Try again runs. Apply retries go back through apply(), so every check re-runs. */
  private retryAction: (() => Promise<void>) | null = null;

  protected readonly step = signal<'idle' | 'checking' | 'applying'>('idle');
  protected readonly preview = signal<DryRunUpdateResponseDto | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly problem = signal<Problem | null>(null);
  protected readonly unsaved = computed(() => this.queue.size());
  protected readonly busy = computed(() => this.step() !== 'idle');
  protected readonly canApply = computed(() => {
    const p = this.preview();
    return p?.diff != null && p.issues.every((i) => i.severity !== 'error') && !isEmptyDiff(p.diff);
  });

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Clear the input so picking the same (edited) file again fires `change` and re-runs the dry run.
    input.value = '';
    if (file) void this.pick(file);
  }

  async pick(file: File): Promise<void> {
    this.file = file;
    this.preview.set(null);
    this.notice.set(null);
    this.problem.set(null);
    const fileProblem = guideFileProblem(file);
    if (fileProblem !== null) {
      this.problem.set({ message: fileProblem, retry: false });
      return;
    }
    this.retryAction = () => this.pick(file);
    await this.attempt(() => this.check(file));
  }

  async apply(): Promise<void> {
    const file = this.file;
    if (!file || !this.canApply() || this.busy()) return;
    this.retryAction = () => this.apply();
    if (this.queue.size() > 0) {
      // §5.7: writes queued since the preview must save first.
      this.problem.set({
        message: 'Waiting for unsaved changes to save. Try Apply again in a moment.',
        retry: true,
      });
      return;
    }
    await this.attempt(async () => {
      this.step.set('applying');
      const payload = await this.api.applyUpdate(this.runId(), file, this.baseVersion);
      this.store.replacePayload(payload);
      this.toasts.show('Guide updated. Progress was kept.');
      this.done.emit();
    });
  }

  protected retry(): void {
    if (this.retryAction) void this.retryAction();
  }

  /** The whole stale-version cycle again: refetch, then a fresh dry run. Busy at once, so a double tap can't start two. */
  private async reviewAgain(file: File): Promise<void> {
    if (this.busy()) return;
    this.problem.set(null);
    this.step.set('checking');
    try {
      await this.store.refetch();
    } finally {
      this.step.set('idle');
    }
    await this.pick(file);
  }

  private async check(file: File): Promise<void> {
    this.step.set('checking');
    const base = this.store.run()!.currentVersion;
    const result = await this.api.dryRunUpdate(this.runId(), file, base);
    this.baseVersion = base;
    this.preview.set(result);
  }

  private async attempt(action: () => Promise<void>, reviewOnStale = true): Promise<void> {
    this.problem.set(null);
    try {
      await action();
    } catch (err) {
      const e = toApiError(err);
      const file = this.file;
      if (e.status === 409 && e.code === 'stale-version' && reviewOnStale && file) {
        // §5.8: a newer version exists. Refetch, then review again against it. Never applies silently.
        this.step.set('checking');
        this.preview.set(null);
        this.retryAction = () => this.reviewAgain(file);
        await this.store.refetch();
        this.notice.set('A newer guide version was uploaded meanwhile. Review the update again.');
        await this.attempt(() => this.check(file), false);
        return;
      }
      if (e.status === 409 && e.code === 'stale-version' && file) {
        // The refetch didn't move us to the newer version: Try again re-runs the whole review cycle.
        this.retryAction = () => this.reviewAgain(file);
        this.problem.set({ message: e.message, retry: true });
      } else if (e.status === 422 && e.issues.length > 0) {
        this.preview.set({ issues: [...e.issues], diff: null });
      } else {
        this.problem.set({ message: e.message, retry: isRetryable(e) });
      }
    } finally {
      this.step.set('idle');
    }
  }

  private runId(): string {
    return this.store.runId()!;
  }
}
