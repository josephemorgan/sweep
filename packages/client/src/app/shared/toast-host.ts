import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { SheetStack } from './sheet-stack';
import { Toasts } from './toasts';

/**
 * Renders toasts. The root host (app shell) shows them in a manual popover (top layer) and only while
 * no sheet is open. A modal <dialog> makes everything outside it inert, so each open topmost Sheet
 * renders its own host (`inSheet`) and the toasts move into it.
 */
@Component({
  selector: 'app-toast-host',
  template: `
    <div role="status" aria-live="polite">
      <div
        #layer
        [attr.popover]="inSheet() ? null : 'manual'"
        class="pointer-events-none fixed inset-x-0 top-auto bottom-[72px] m-0 flex h-auto w-full flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-0 px-4 handheld:bottom-4"
      >
        @for (toast of visible(); track toast.id) {
          <div
            class="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-panel border border-border bg-surface-raised py-1 pl-4 pr-1 shadow-lg"
            (mouseenter)="onEnter(toast.id)"
            (mouseleave)="onLeave($event, toast.id)"
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
  /** True for the host rendered inside a sheet's dialog (no popover, always shows toasts). */
  readonly inSheet = input(false);
  protected readonly toasts = inject(Toasts);
  private readonly stack = inject(SheetStack);
  private readonly doc = inject(DOCUMENT);
  private readonly layer = viewChild.required<ElementRef<HTMLElement>>('layer');
  private readonly hovered = new Set<number>();
  protected readonly visible = computed(() =>
    this.inSheet() || this.stack.isEmpty() ? this.toasts.toasts() : [],
  );

  constructor() {
    effect(() => {
      const el = this.layer().nativeElement;
      if (this.inSheet() || typeof el.showPopover !== 'function') return;
      const want = this.visible().length > 0;
      const isOpen = el.matches(':popover-open');
      if (want && !isOpen) el.showPopover();
      else if (!want && isOpen) el.hidePopover();
    });
    // Toasts move between hosts when a sheet opens or closes. Elements that were hovered or focused
    // vanish without leave events, so restart any paused countdown.
    effect(() => {
      this.stack.top();
      untracked(() => this.release());
    });
    inject(DestroyRef).onDestroy(() => this.release());
  }

  protected onEnter(id: number): void {
    this.hovered.add(id);
    this.toasts.pause(id);
  }

  protected onLeave(event: MouseEvent, id: number): void {
    this.hovered.delete(id);
    const toast = event.currentTarget as HTMLElement;
    if (!toast.contains(this.doc.activeElement)) this.toasts.resume(id);
  }

  protected onFocusOut(event: FocusEvent, id: number): void {
    const toast = event.currentTarget as HTMLElement;
    if (toast.contains(event.relatedTarget as Node | null)) return;
    if (!this.hovered.has(id)) this.toasts.resume(id);
  }

  private release(): void {
    this.hovered.clear();
    this.toasts.resumeAll();
  }
}
