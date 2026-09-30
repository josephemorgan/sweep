import {
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
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
        class="flex min-h-[42px] min-w-11 items-center gap-2.5 text-left"
        [attr.aria-label]="label()"
        (click)="reveal($event)"
      >
        <span aria-hidden="true" class="redaction" [style.width.px]="barWidth()"></span>
        <span class="text-xs text-fg-muted">tap to reveal</span>
        <!-- The redaction is a courtesy, not a security boundary: Ctrl+F may still find the text. -->
        <span aria-hidden="true" class="sr-only select-none">{{ text() }}</span>
      </button>
    } @else {
      <span #shown tabindex="-1">{{ text() }}</span>
    }
  `,
})
export class SpoilerText {
  readonly text = input.required<string>();
  /** The spoiler rule applies (the caller decides: spoiler and not done/reached). */
  readonly hidden = input(false);
  readonly revealKey = input.required<string>();
  /** Emitted after a tap reveals the text. */
  readonly revealed = output<void>();
  readonly label = input('Hidden spoiler. Tap to reveal.');
  /** Bar width in px: 7 per character, clamped to 64..176. */
  protected readonly barWidth = computed(() => Math.min(176, Math.max(64, 7 * this.text().length)));
  private readonly injector = inject(Injector);
  private readonly reveals = inject(Reveals);
  private readonly shown = viewChild<ElementRef<HTMLElement>>('shown');
  protected readonly blurred = computed(() => this.hidden() && !this.reveals.has(this.revealKey()));

  protected reveal(event: Event): void {
    event.stopPropagation();
    this.reveals.reveal(this.revealKey());
    this.revealed.emit();
    // The tapped button is destroyed; keep focus on the revealed text instead of <body>.
    afterNextRender(() => this.shown()?.nativeElement.focus(), { injector: this.injector });
  }
}
