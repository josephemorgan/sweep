import {
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  viewChild,
  type ElementRef,
} from '@angular/core';
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
        <!-- The blur is a courtesy, not a security boundary: Ctrl+F may still find the text. -->
        <span aria-hidden="true" class="select-none blur-md">{{ text() }}</span>
      </button>
    } @else {
      <span #shown tabindex="-1" class="outline-none">{{ text() }}</span>
    }
  `,
})
export class SpoilerText {
  readonly text = input.required<string>();
  /** The spoiler rule applies (the caller decides: spoiler and not done/reached). */
  readonly hidden = input(false);
  readonly revealKey = input.required<string>();
  readonly label = input('Hidden spoiler. Tap to reveal.');
  private readonly injector = inject(Injector);
  private readonly reveals = inject(Reveals);
  private readonly shown = viewChild<ElementRef<HTMLElement>>('shown');
  protected readonly blurred = computed(() => this.hidden() && !this.reveals.has(this.revealKey()));

  protected reveal(event: Event): void {
    event.stopPropagation();
    this.reveals.reveal(this.revealKey());
    // The tapped button is destroyed; keep focus on the revealed text instead of <body>.
    afterNextRender(() => this.shown()?.nativeElement.focus(), { injector: this.injector });
  }
}
