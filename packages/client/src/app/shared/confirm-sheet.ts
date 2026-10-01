import { Component, input, model, output } from '@angular/core';
import { Sheet } from './sheet';

@Component({
  selector: 'app-confirm-sheet',
  imports: [Sheet],
  template: `
    <app-sheet [heading]="heading()" [(open)]="open">
      <div class="flex flex-col gap-4 px-5 pb-5 pt-3">
        <p class="m-0">{{ message() }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn" (click)="open.set(false)">Cancel</button>
          <button
            type="button"
            [class]="danger() ? 'btn-danger' : 'btn-primary'"
            [disabled]="busy()"
            (click)="confirm()"
          >
            {{ confirmLabel() }}
          </button>
        </div>
      </div>
    </app-sheet>
  `,
})
export class ConfirmSheet {
  readonly heading = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly danger = input(false);
  /** An action started by `confirmed` is still running: the confirm button is disabled. */
  readonly busy = input(false);
  readonly open = model(false);
  readonly confirmed = output<void>();

  protected confirm(): void {
    // Emit first: a parent that clears its pending state on openChange(false) would lose it.
    this.confirmed.emit();
    this.open.set(false);
  }
}
