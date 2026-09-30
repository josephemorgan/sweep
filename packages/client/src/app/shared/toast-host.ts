import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { Toasts } from './toasts';

/**
 * Renders toasts. The live region is always in the DOM; the toasts sit in a manual popover so they
 * live in the top layer and stay visible and clickable above an open modal <dialog> sheet.
 */
@Component({
  selector: 'app-toast-host',
  template: `
    <div role="status" aria-live="polite">
      <div
        #layer
        popover="manual"
        class="pointer-events-none fixed inset-x-0 top-auto bottom-32 m-0 flex h-auto w-full flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-0 px-4 handheld:bottom-14"
      >
        @for (toast of toasts.toasts(); track toast.id) {
          <div
            class="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-card border border-border bg-surface-raised py-1 pl-4 pr-1 shadow-lg"
            (mouseenter)="toasts.pause(toast.id)"
            (mouseleave)="toasts.resume(toast.id)"
            (focusin)="toasts.pause(toast.id)"
            (focusout)="onFocusOut($event, toast.id)"
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
    </div>
  `,
})
export class ToastHost {
  protected readonly toasts = inject(Toasts);
  private readonly layer = viewChild.required<ElementRef<HTMLElement>>('layer');

  constructor() {
    effect(() => {
      const el = this.layer().nativeElement;
      const want = this.toasts.toasts().length > 0;
      if (typeof el.showPopover !== 'function') return;
      const isOpen = el.matches(':popover-open');
      if (want && !isOpen) el.showPopover();
      else if (!want && isOpen) el.hidePopover();
    });
  }

  protected onFocusOut(event: FocusEvent, id: number): void {
    const toast = event.currentTarget as HTMLElement;
    if (!toast.contains(event.relatedTarget as Node | null)) this.toasts.resume(id);
  }
}
