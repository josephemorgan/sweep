import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { WriteQueue } from '../sync/write-queue';

/** A write is normally saved in ~100 ms: only a queue that lingers is worth a warning. */
export const UNSAVED_DELAY_MS = 1_000;

@Component({
  selector: 'app-unsaved-badge',
  // The live region is always in the DOM (announcements need it) and reserves its width, so
  // showing the count never moves the controls beside it.
  template: `
    <span
      role="status"
      aria-live="polite"
      class="inline-flex min-h-11 w-28 handheld-narrow:w-11 items-center justify-center text-sm"
    >
      @if (shown()) {
        <span class="inline-flex items-center gap-1 text-last-chance">
          <span aria-hidden="true">●</span>
          <span aria-hidden="true" class="handheld-narrow:hidden">{{ queue.size() }} unsaved</span>
          <span aria-hidden="true" class="hidden handheld-narrow:inline">{{ queue.size() }}</span>
          <span class="sr-only">
            {{ queue.size() }} unsaved {{ queue.size() === 1 ? 'change' : 'changes' }}
          </span>
        </span>
      }
    </span>
  `,
})
export class UnsavedBadge {
  protected readonly queue = inject(WriteQueue);
  private readonly lingered = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Stalled (backoff or paused), or non-empty for a full second without a break. */
  protected readonly shown = (): boolean =>
    this.queue.size() > 0 && (this.queue.stalled() || this.lingered());

  constructor() {
    effect(() => {
      const nonEmpty = this.queue.size() > 0;
      untracked(() => {
        if (!nonEmpty) {
          this.cancel();
          this.lingered.set(false);
        } else if (this.timer === null && !this.lingered()) {
          this.timer = setTimeout(() => {
            this.timer = null;
            this.lingered.set(true);
          }, UNSAVED_DELAY_MS);
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.cancel());
  }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
