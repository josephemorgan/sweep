import { Component, inject } from '@angular/core';
import { WriteQueue } from '../sync/write-queue';

@Component({
  selector: 'app-unsaved-badge',
  template: `
    <span role="status" aria-live="polite" class="text-sm">
      @if (queue.size() > 0) {
        <span class="inline-flex min-h-11 items-center gap-1 px-2 text-last-chance">
          <span aria-hidden="true">●</span>{{ queue.size() }} unsaved
        </span>
      }
    </span>
  `,
})
export class UnsavedBadge {
  protected readonly queue = inject(WriteQueue);
}
