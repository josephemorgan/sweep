import { Component, inject } from '@angular/core';
import { Toasts } from './toasts';

@Component({
  selector: 'app-toast-host',
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-32 z-50 flex flex-col items-center gap-2 px-4 handheld:bottom-14"
      role="status"
      aria-live="polite"
    >
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          class="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-card border border-border bg-surface-raised py-1 pl-4 pr-1 shadow-lg"
        >
          <p class="m-0 flex-1 text-sm">{{ toast.message }}</p>
          @if (toast.action; as action) {
            <button
              type="button"
              class="btn-quiet font-semibold text-accent"
              (click)="toasts.runAction(toast.id)"
            >
              {{ action.label }}
            </button>
          }
          <button
            type="button"
            class="btn-quiet"
            aria-label="Dismiss"
            (click)="toasts.dismiss(toast.id)"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly toasts = inject(Toasts);
}
