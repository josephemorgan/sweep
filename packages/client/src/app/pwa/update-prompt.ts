import { Component, DOCUMENT, DestroyRef, InjectionToken, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, type VersionEvent, type VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { WriteQueue } from '../sync/write-queue';

export const RELOAD = new InjectionToken<() => void>('RELOAD', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT);
    return () => doc.location.reload();
  },
});

/** How long a reload waits for the write queue before giving up (queued writes survive a reload). */
export const FLUSH_WAIT_MS = 3_000;
/** How long the "saved on this device" note shows before the reload. */
export const NOTE_MS = 1_500;

@Component({
  selector: 'app-update-prompt',
  template: `
    @if (message(); as text) {
      <div
        role="status"
        class="fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-center gap-3 border-b border-border bg-surface-raised px-4 py-1 text-sm"
      >
        <span>{{ text }}</span>
        <button type="button" class="btn-primary" [disabled]="busy()" (click)="reload()">
          Reload to update
        </button>
      </div>
    }
  `,
})
export class UpdatePrompt {
  private readonly reloadPage = inject(RELOAD);
  private readonly queue = inject(WriteQueue);
  protected readonly message = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    const updates = inject(SwUpdate);
    if (!updates.isEnabled) return;
    updates.versionUpdates
      .pipe(
        filter((e: VersionEvent): e is VersionReadyEvent => e.type === 'VERSION_READY'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.message.set('A new version of Sweep is ready.'));
    updates.unrecoverable
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.message.set('Sweep needs to reload to keep working.'));
    const doc = inject(DOCUMENT);
    const check = (): void => {
      if (doc.visibilityState === 'visible') void updates.checkForUpdate().catch(() => false);
    };
    doc.addEventListener('visibilitychange', check);
    inject(DestroyRef).onDestroy(() => doc.removeEventListener('visibilitychange', check));
  }

  protected async reload(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    // Try to send queued writes first, but never hold the reload hostage.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const giveUp = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, FLUSH_WAIT_MS);
    });
    await Promise.race([this.queue.flush().catch(() => undefined), giveUp]);
    clearTimeout(timer);
    if (this.queue.size() > 0) {
      this.message.set(
        'Your latest changes are saved on this device and will sync after the reload.',
      );
      await new Promise<void>((resolve) => setTimeout(resolve, NOTE_MS));
    }
    this.reloadPage();
  }
}
