import { Component, computed, inject, input, signal } from '@angular/core';
import { MarkdownView } from '../shared/markdown-view';
import { Sheet } from '../shared/sheet';
import { Reveals } from './reveals';
import { RunLayout } from './run-layout';
import { RunStore } from './run-store';
import { sectionBlurred, sectionRevealKey } from './spoiler';
import { SpoilerText } from './spoiler-text';

@Component({
  selector: 'app-group-heading',
  imports: [MarkdownView, Sheet, SpoilerText],
  host: { class: 'block' },
  template: `
    <div
      [id]="'section-' + groupId()"
      class="flex scroll-mt-14 items-center gap-2 pl-[38px] pr-4 pt-4"
    >
      <div
        role="heading"
        [attr.aria-level]="level()"
        class="flex min-w-0 flex-1 items-center gap-2"
        [class]="
          depth() <= 1 ? 'text-xs text-fg-muted' : 'font-display text-[15px]/5 font-semibold'
        "
      >
        <button
          type="button"
          class="flex min-h-11 min-w-11 items-center gap-2 text-left"
          [class.flex-1]="depth() > 1"
          [attr.aria-expanded]="!collapsed()"
          [attr.aria-label]="
            (collapsed() ? 'Expand ' : 'Collapse ') + (blurred() ? 'hidden section' : group().title)
          "
          (click)="layout.setCollapsed(groupId(), !collapsed())"
        >
          <span aria-hidden="true">{{ collapsed() ? '▸' : '▾' }}</span>
          @if (blurred()) {
            <span aria-hidden="true" class="redaction" [style.width.px]="barWidth()"></span>
            <span aria-hidden="true" class="sr-only select-none">{{ group().title }}</span>
          } @else {
            <span class="min-w-0">{{ group().title }}</span>
          }
        </button>
        <span class="text-xs font-normal text-fg-muted" [class.ml-auto]="depth() > 1"
          >{{ progress().cleared }} of {{ progress().total
          }}<span class="sr-only"> leaves cleared</span></span
        >
      </div>
      @if (group().walkthrough) {
        <button
          type="button"
          class="btn-quiet text-[13px] text-accent"
          [attr.aria-label]="'Walkthrough for ' + (blurred() ? 'a hidden section' : group().title)"
          (click)="walkthroughOpen.set(true)"
        >
          Walkthrough
        </button>
      }
    </div>
    @if (blurred() || group().overview) {
      <p class="m-0 pl-[38px] pr-4 text-[13px] text-fg-soft">
        <app-spoiler-text
          [text]="group().overview"
          [hidden]="blurred()"
          [revealKey]="revealKey()"
          label="Hidden spoiler section. Tap to reveal."
        />
      </p>
    }
    <app-sheet heading="Walkthrough" [(open)]="walkthroughOpen">
      @if (walkthroughOpen() && group().walkthrough; as walkthrough) {
        <app-markdown-view class="block p-4" [source]="walkthrough" />
      }
    </app-sheet>
  `,
})
export class GroupHeading {
  readonly groupId = input.required<string>();
  readonly level = input(2);
  /** 1 for a top-level group. */
  readonly depth = input(1);
  protected readonly store = inject(RunStore);
  protected readonly layout = inject(RunLayout);
  private readonly reveals = inject(Reveals);
  protected readonly walkthroughOpen = signal(false);
  protected readonly group = computed(() => this.store.index()!.sections.get(this.groupId())!);
  protected readonly progress = computed(() => this.store.view()!.groups.get(this.groupId())!);
  /** Redaction bar width in px: 7 per character, clamped to 64..176. */
  protected readonly barWidth = computed(() =>
    Math.min(176, Math.max(64, 7 * this.group().title.length)),
  );
  protected readonly collapsed = computed(() => this.layout.isCollapsed(this.groupId()));
  protected readonly revealKey = computed(() => sectionRevealKey(this.groupId()));
  protected readonly blurred = computed(() =>
    sectionBlurred(
      this.group(),
      this.store.view()!.sections.get(this.groupId()),
      this.reveals.has(this.revealKey()),
    ),
  );
}
