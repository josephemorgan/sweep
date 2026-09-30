import { Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import type { CardCategory, CardView, Task, TaskStatus } from '@sweep/core';
import { MarkdownView } from '../shared/markdown-view';
import { lockReason } from './lock-reason';
import { Reveals } from './reveals';
import { RunActions } from './run-actions';
import { RunLayout } from './run-layout';
import { RunStore } from './run-store';
import { sectionBlurred, sectionLabel, sectionRevealKey } from './spoiler';
import { SpoilerText } from './spoiler-text';
import { stickyCategories } from './sticky-rows';
import { TaskRow } from './task-row';

interface CardSource {
  card: CardView;
  expanded: boolean;
  epoch: number;
  version: number | undefined;
}

@Component({
  selector: 'app-leaf-card',
  imports: [MarkdownView, SpoilerText, TaskRow],
  host: { class: 'block' },
  template: `
    <!-- Read on every render, collapsed or not, so the sticky snapshot ends when the card collapses (§5.3). -->
    @let shownCategories = categories();
    <section
      [id]="'section-' + leafId()"
      [attr.aria-label]="blurred() ? 'Hidden section' : leaf().title"
      [attr.data-state]="state()"
      class="scroll-mt-14"
      [class]="cardClasses()"
    >
      <div role="heading" [attr.aria-level]="level()">
        <button
          type="button"
          class="flex w-full items-center gap-2.5 pl-3 pr-4 text-left"
          [class]="buttonClasses()"
          [attr.aria-current]="detailPane() && selected() ? 'true' : null"
          [attr.aria-expanded]="detailPane() ? null : expanded()"
          [attr.aria-controls]="expanded() && !detailPane() ? bodyId() : null"
          (click)="headerClick()"
        >
          <span data-node aria-hidden="true" class="relative z-10 flex w-4 shrink-0 justify-center">
            @switch (node()) {
              @case ('lamp') {
                <span
                  class="size-3.5 rounded-full bg-lamp"
                  style="box-shadow: 0 0 0 3px var(--color-surface), 0 0 0 4.5px var(--color-rail-ring)"
                ></span>
              }
              @case ('cleared') {
                <span class="size-2 rounded-full bg-rail-dot"></span>
              }
              @case ('locked') {
                <span
                  class="size-[9px] rounded-full border-[1.5px] border-dashed border-rail-ring bg-surface"
                ></span>
              }
              @default {
                <span
                  class="size-[9px] rounded-full border-[1.5px] border-solid border-rail-ring bg-surface"
                ></span>
              }
            }
          </span>
          <span class="min-w-0 flex-1 py-1">
            <span class="block" [class]="titleClasses()">
              @if (state() === 'locked') {
                <span class="sr-only">Locked:</span>
              }
              @if (blurred()) {
                <span class="inline-flex items-center gap-2.5"
                  ><span aria-hidden="true" class="redaction" [style.width.px]="barWidth()"></span
                  ><span aria-hidden="true" class="text-xs font-normal text-fg-muted"
                    >tap to reveal</span
                  ><span aria-hidden="true" class="sr-only select-none">{{ leaf().title }}</span
                  ><span class="sr-only">Hidden section</span></span
                >
              } @else {
                {{ leaf().title }}
              }
            </span>
            @if (variant() === 'row') {
              @if (hint(); as text) {
                <span data-hint class="block text-xs text-fg-muted">{{ text }}</span>
              } @else if (lockText(); as text) {
                <span class="block text-xs text-fg-muted">{{ text }}</span>
              }
            }
          </span>
          @if (pinned()) {
            <span class="text-xs text-accent">Pinned</span>
          }
          @if (openCount() > 0) {
            <span class="text-[13px]" [class]="state() === 'locked' ? 'text-fg-muted' : 'text-open'"
              >{{ openCount() }} open</span
            >
          }
        </button>
      </div>
      @if (variant() === 'panel') {
        @if (hint(); as text) {
          <p data-hint class="m-0 px-3 pb-2 text-xs text-fg-muted">{{ text }}</p>
        } @else if (lockText(); as text) {
          <p class="m-0 px-3 pb-2 text-sm">{{ text }}</p>
        }
      }
      @if (variant() === 'panel' && expanded()) {
        <div [id]="bodyId()" class="flex flex-col gap-2 px-3 pb-3">
          <p class="m-0 text-sm text-fg-muted">
            <app-spoiler-text
              [text]="leaf().overview"
              [hidden]="blurred()"
              [revealKey]="revealKey()"
              label="Hidden spoiler section. Tap to reveal."
            />
          </p>
          @if (leaf().walkthrough; as walkthrough) {
            <details class="rounded-control border border-border px-2">
              <summary class="flex min-h-11 cursor-pointer items-center">Walkthrough</summary>
              <app-markdown-view class="block pb-2" [source]="walkthrough" />
            </details>
          }
          @for (category of shownCategories; track category.categoryId) {
            <details open class="rounded-control border border-border px-2">
              <summary class="flex min-h-11 cursor-pointer items-center gap-1">
                {{ categoryName(category.categoryId) }} {{ category.done }}/{{ category.total }}
                @if (category.missed > 0) {
                  <span class="text-missed">· {{ category.missed }} missed</span>
                }
              </summary>
              <ul class="m-0 list-none p-0">
                @for (row of category.rows; track row.taskId) {
                  <li>
                    <app-task-row
                      [task]="task(row.taskId)"
                      [status]="row.status"
                      [secondChance]="row.secondChance"
                      [lastChance]="store.lastChanceIds().has(row.taskId)"
                      [nextChanceLabel]="nextChanceLabel(row.status)"
                      (stateChange)="store.setTaskState(row.taskId, $event)"
                    />
                  </li>
                }
              </ul>
            </details>
          }
          <div class="flex flex-wrap justify-end gap-2 pt-1">
            @if (state() === 'cleared') {
              <button type="button" class="btn" (click)="store.setCleared(leafId(), false)">
                Reopen section
              </button>
            } @else {
              @if (pinned()) {
                <button type="button" class="btn" (click)="actions.unpin()">Unpin</button>
              } @else {
                <button type="button" class="btn" (click)="actions.requestPin(leafId())">
                  I'm here
                </button>
              }
              <button type="button" class="btn-primary" (click)="actions.requestClear(leafId())">
                Clear section
              </button>
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class LeafCard {
  readonly leafId = input.required<string>();
  readonly level = input(3);
  readonly variant = input<'row' | 'panel'>('row');
  readonly columns = input<1 | 2>(1);
  /** Replaces the lock text, e.g. "Opens after <current>". */
  readonly hint = input<string | null>(null);
  /** Two-pane layout: the header selects the row instead of expanding it. */
  readonly detailPane = input(false);
  readonly selected = input(false);
  // eslint-disable-next-line @angular-eslint/no-output-native -- name fixed by the route plan (Section C consumes it)
  readonly select = output<void>();

  protected readonly store = inject(RunStore);
  protected readonly layout = inject(RunLayout);
  protected readonly actions = inject(RunActions);
  private readonly reveals = inject(Reveals);

  private readonly view = computed(() => this.store.view()!);
  private readonly index = computed(() => this.store.index()!);
  protected readonly leaf = computed(() => this.index().sections.get(this.leafId())!);
  protected readonly state = computed(() => this.view().sections.get(this.leafId())!.state);
  protected readonly expanded = computed(() => this.layout.isExpanded(this.leafId()));
  protected readonly pinned = computed(
    () => this.view().pinned && this.view().current === this.leafId(),
  );
  /** Highlighted (selected) row of the two-pane layout. */
  private readonly compact = computed(
    () => this.variant() === 'row' && this.detailPane() && this.selected(),
  );
  protected readonly node = computed<'lamp' | 'cleared' | 'locked' | 'unlocked'>(() => {
    const state = this.state();
    if (state === 'cleared') return 'cleared';
    if (state === 'current') return 'lamp';
    return state === 'locked' ? 'locked' : 'unlocked';
  });
  protected readonly cardClasses = computed(() => {
    const state = this.state();
    if (this.variant() === 'row') return this.compact() ? 'rounded-l-panel bg-surface-raised' : '';
    const colors =
      state === 'current'
        ? 'border-accent bg-surface-raised'
        : state === 'locked'
          ? 'border-border bg-surface text-fg-muted'
          : 'border-border bg-surface-raised';
    return 'border rounded-panel ' + colors;
  });
  protected readonly buttonClasses = computed(() => {
    if (this.variant() === 'panel') return 'min-h-11';
    if (this.compact()) return 'min-h-11';
    switch (this.state()) {
      case 'cleared':
        return 'h-9 text-fg-cleared';
      case 'locked':
        return 'min-h-11 text-fg-muted';
      default:
        return 'min-h-11';
    }
  });
  protected readonly titleClasses = computed(() => {
    if (this.compact()) return 'font-display font-semibold text-[15px] text-lamp truncate';
    if (this.variant() === 'panel')
      return this.state() === 'cleared'
        ? 'text-sm font-medium line-through'
        : 'text-sm font-medium';
    return this.state() === 'cleared'
      ? 'text-sm truncate line-through decoration-rail-dot'
      : 'text-sm truncate';
  });
  protected readonly bodyId = computed(() => 'card-body-' + this.leafId());
  protected readonly revealKey = computed(() => sectionRevealKey(this.leafId()));
  /** Redaction bar width in px: 7 per character, clamped to 64..176. */
  protected readonly barWidth = computed(() =>
    Math.min(176, Math.max(64, 7 * this.leaf().title.length)),
  );
  protected readonly blurred = computed(() =>
    sectionBlurred(
      this.leaf(),
      this.view().sections.get(this.leafId()),
      this.reveals.has(this.revealKey()),
    ),
  );
  protected readonly lockText = computed(() => {
    const section = this.view().sections.get(this.leafId())!;
    if (section.unlocked || section.cleared) return null;
    const reason = lockReason(this.index(), this.view(), this.leafId());
    if (!reason) return null;
    const names = reason.ids.map((id) => this.label(id)).join(', ');
    return reason.mode === 'all' ? `Requires: ${names}` : `Requires one of: ${names}`;
  });
  protected readonly categories = linkedSignal<CardSource, readonly CardCategory[]>({
    source: () => ({
      card: this.view().cards.get(this.leafId())!,
      expanded: this.expanded(),
      epoch: this.layout.expansionEpoch(this.leafId()),
      version: this.store.run()?.currentVersion,
    }),
    computation: (source, previous) =>
      source.expanded &&
      previous?.source.expanded &&
      previous.source.epoch === source.epoch &&
      previous.source.version === source.version
        ? stickyCategories(
            previous.value,
            source.card.categories,
            (id) => this.view().tasks.get(id),
            this.view().tracked,
          )
        : source.card.categories,
  });
  protected readonly openCount = computed(() =>
    this.view()
      .cards.get(this.leafId())!
      .categories.reduce((n, c) => n + c.rows.filter((r) => r.status.kind === 'open').length, 0),
  );

  protected headerClick(): void {
    if (this.detailPane()) this.select.emit();
    else this.layout.setExpanded(this.leafId(), !this.expanded());
  }

  protected task(taskId: string): Task {
    return this.index().tasks.get(taskId)!;
  }

  protected categoryName(categoryId: string): string {
    return this.store.guide()!.categories.find((c) => c.id === categoryId)?.name ?? categoryId;
  }

  protected nextChanceLabel(status: TaskStatus): string | null {
    return status.kind === 'missed' && status.nextChance !== null
      ? this.label(status.nextChance)
      : null;
  }

  private label(sectionId: string): string {
    return sectionLabel(this.index(), this.view(), this.reveals, sectionId);
  }
}
