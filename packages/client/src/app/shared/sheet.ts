import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  model,
  viewChild,
} from '@angular/core';
import { SheetStack } from './sheet-stack';
import { ToastHost } from './toast-host';

let nextSheetId = 0;

/**
 * A modal sheet on a native <dialog> (focus trap, Escape, focus return for free). Bottom sheet on a
 * phone, right-side panel under the handheld variant (styles.css `.sheet`). Content is projected
 * unconditionally: wrap heavy content in `@if (open)` in the parent.
 */
@Component({
  selector: 'app-sheet',
  imports: [ToastHost],
  template: `
    <dialog #dialog class="sheet" [attr.aria-labelledby]="headingId" (close)="open.set(false)">
      <div class="flex items-center gap-2 border-b border-border py-1 pl-4 pr-1">
        <h2 [id]="headingId" class="m-0 flex-1 text-base font-semibold">{{ heading() }}</h2>
        <button type="button" class="btn-quiet" aria-label="Close" (click)="open.set(false)">
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div class="sheet-body"><ng-content /></div>
      @if (stack.isTop(this)) {
        <app-toast-host [inSheet]="true" />
      }
    </dialog>
  `,
})
export class Sheet {
  readonly heading = input.required<string>();
  readonly open = model(false);
  protected readonly headingId = `sheet-${++nextSheetId}`;
  protected readonly stack = inject(SheetStack);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stack.remove(this));
    effect(() => {
      if (this.open()) this.stack.push(this);
      else this.stack.remove(this);
    });
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) {
        if (typeof el.showModal === 'function') el.showModal();
        else el.setAttribute('open', '');
      } else if (!this.open() && el.hasAttribute('open')) {
        if (typeof el.close === 'function') el.close();
        else el.removeAttribute('open');
      }
    });
  }
}
