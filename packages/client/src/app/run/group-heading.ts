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
    <div [id]="'section-' + groupId()" class="flex scroll-mt-14 items-start gap-1 pt-4">
      <button
        type="button"
        class="btn-quiet"
        [attr.aria-expanded]="!collapsed()"
        [attr.aria-label]="
          (collapsed() ? 'Expand ' : 'Collapse ') + (blurred() ? 'hidden section' : group().title)
        "
        (click)="layout.setCollapsed(groupId(), !collapsed())"
      >
        <span aria-hidden="true">{{ collapsed() ? '▸' : '▾' }}</span>
      </button>
      <div class="min-w-0 flex-1 pt-2">
        <div role="heading" [attr.aria-level]="level()" class="text-lg font-semibold">
          <app-spoiler-text [text]="group().title" [hidden]="blurred()" [revealKey]="revealKey()" />
        </div>
        <p class="m-0 text-sm text-fg-muted">
          <app-spoiler-text
            [text]="group().overview"
            [hidden]="blurred()"
            [revealKey]="revealKey()"
          />
        </p>
      </div>
      <span class="pt-2 text-sm text-fg-muted"
        ><span aria-hidden="true">{{ progress().cleared }}/{{ progress().total }}</span
        ><span class="sr-only"
          >{{ progress().cleared }} of {{ progress().total }} leaves cleared</span
        ></span
      >
      @if (group().walkthrough) {
        <button
          type="button"
          class="btn-quiet"
          [attr.aria-label]="'Walkthrough for ' + (blurred() ? 'a hidden section' : group().title)"
          (click)="walkthroughOpen.set(true)"
        >
          Walkthrough
        </button>
      }
    </div>
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
  protected readonly store = inject(RunStore);
  protected readonly layout = inject(RunLayout);
  private readonly reveals = inject(Reveals);
  protected readonly walkthroughOpen = signal(false);
  protected readonly group = computed(() => this.store.index()!.sections.get(this.groupId())!);
  protected readonly progress = computed(() => this.store.view()!.groups.get(this.groupId())!);
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
