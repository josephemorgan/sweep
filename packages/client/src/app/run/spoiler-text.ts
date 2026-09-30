import { Component, computed, inject, input } from '@angular/core';
import { Reveals } from './reveals';

@Component({
  selector: 'app-spoiler-text',
  template: `
    @if (blurred()) {
      <button
        type="button"
        class="min-h-11 min-w-11 text-left"
        [attr.aria-label]="label()"
        (click)="reveal($event)"
      >
        <span aria-hidden="true" class="select-none blur-sm">{{ text() }}</span>
      </button>
    } @else {
      {{ text() }}
    }
  `,
})
export class SpoilerText {
  readonly text = input.required<string>();
  /** The spoiler rule applies (the caller decides: spoiler and not done/reached). */
  readonly hidden = input(false);
  readonly revealKey = input.required<string>();
  readonly label = input('Hidden spoiler. Tap to reveal.');
  private readonly reveals = inject(Reveals);
  protected readonly blurred = computed(() => this.hidden() && !this.reveals.has(this.revealKey()));

  protected reveal(event: Event): void {
    event.stopPropagation();
    this.reveals.reveal(this.revealKey());
  }
}
