import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Injector,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
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
  leafId: string;
  expanded: boolean;
  epoch: number;
  version: number | undefined;
}

@Component({
  selector: 'app-leaf-card',
  imports: [MarkdownView, NgTemplateOutlet, SpoilerText, TaskRow],
  host: { class: 'block' },
  template: `
    <!-- Read on every render, collapsed or not, so the sticky snapshot ends when the card collapses (§5.3). -->
    @let shownColumns = categoryColumns();
    @if (variant() === 'row') {
      <section
        [id]="'section-' + leafId()"
        [attr.aria-label]="blurred() ? 'Hidden section' : leaf().title"
        [attr.data-state]="state()"
        class="scroll-mt-2"
        [class]="cardClasses()"
      >
        <div role="heading" [attr.aria-level]="level()">
          <button
            #toggle
            type="button"
            class="flex w-full items-center gap-2.5 pl-3 pr-4 text-left"
            [class]="buttonClasses()"
            [attr.aria-current]="detailPane() && selected() ? 'true' : null"
            [attr.aria-expanded]="detailPane() ? null : expanded()"
            [attr.aria-controls]="expanded() && !detailPane() ? bodyId() : null"
            (click)="headerClick()"
          >
            <span
              data-node
              aria-hidden="true"
              class="relative z-10 flex w-4 shrink-0 justify-center"
            >
              <ng-container [ngTemplateOutlet]="nodeTpl" />
            </span>
            <span class="min-w-0 flex-1 py-1">
              <span class="block" [class]="titleClasses()">
                <ng-container [ngTemplateOutlet]="titleTpl" />
              </span>
              @if (hint(); as text) {
                <span data-hint class="block text-xs text-fg-muted">{{ text }}</span>
              } @else if (lockText(); as text) {
                <span class="block text-xs text-fg-muted">{{ text }}</span>
              }
            </span>
            @if (pinned()) {
              <span class="text-xs text-accent">Pinned</span>
            }
            @if (openCount() > 0) {
              <span
                class="text-[13px]"
                [class]="state() === 'locked' ? 'text-fg-muted' : 'text-open'"
                >{{ openCount() }} open</span
              >
            }
          </button>
        </div>
      </section>
    } @else {
      <section
        [id]="(detailPane() ? 'detail-section-' : 'section-') + leafId()"
        [attr.aria-label]="panelLabel()"
        [attr.data-state]="state()"
        class="mt-0.5 flex scroll-mt-2 gap-2.5 pl-3 pt-1"
      >
        @if (!detailPane()) {
          <!-- relative: paint the node above section-list's absolutely positioned rail line. -->
          <div
            data-node
            aria-hidden="true"
            class="relative flex w-4 shrink-0 justify-center"
            [class]="node() === 'lamp' ? 'pt-4' : 'pt-[19px]'"
          >
            <ng-container [ngTemplateOutlet]="nodeTpl" />
          </div>
        }
        <div
          class="flex min-w-0 grow flex-col gap-2 rounded-l-panel bg-surface-raised px-4 py-3 pl-3.5"
        >
          <div class="flex items-start gap-2">
            <div role="heading" [attr.aria-level]="level()" class="min-w-0 grow">
              <button
                #toggle
                type="button"
                class="flex min-h-11 w-full items-center text-left"
                [attr.aria-expanded]="detailPane() ? null : expanded()"
                [attr.aria-controls]="open() && !detailPane() ? bodyId() : null"
                (click)="headerClick()"
              >
                <span class="block" [class]="titleClasses()">
                  <ng-container [ngTemplateOutlet]="titleTpl" />
                </span>
              </button>
            </div>
            @if (pinned()) {
              <span class="shrink-0 whitespace-nowrap pt-3 text-xs text-accent">Pinned</span>
            }
            @if (openCount() > 0) {
              <span
                class="shrink-0 whitespace-nowrap pt-3 font-display text-sm font-semibold"
                [class]="state() === 'locked' ? 'text-fg-muted' : 'text-open'"
                >{{ openCount() }} open</span
              >
            }
          </div>
          @if (hint(); as text) {
            <p data-hint class="m-0 text-xs text-fg-muted">{{ text }}</p>
          } @else if (lockText(); as text) {
            <p class="m-0 text-sm text-fg-muted">{{ text }}</p>
          }
          @if (open()) {
            <div [id]="bodyId()" class="flex flex-col gap-2">
              <p class="m-0 text-sm leading-[19px] text-fg-soft">
                <app-spoiler-text
                  [text]="leaf().overview"
                  [hidden]="blurred()"
                  [revealKey]="revealKey()"
                  label="Hidden spoiler section. Tap to reveal."
                />
              </p>
              <div [class]="columns() === 2 ? 'grid grid-cols-2 gap-x-8' : 'flex flex-col gap-2'">
                @for (column of shownColumns; track $index) {
                  <div class="flex min-w-0 flex-col gap-2">
                    @for (category of column; track category.categoryId) {
                      <div>
                        <div
                          data-category-header
                          class="flex items-baseline gap-2 border-b border-rule pt-1.5 text-xs text-fg-muted"
                        >
                          <span>{{ categoryName(category.categoryId) }}</span>
                          @if (category.missed > 0) {
                            <span class="text-missed">· {{ category.missed }} missed</span>
                          }
                          <span class="ml-auto">{{ category.done }} of {{ category.total }}</span>
                        </div>
                        <ul
                          class="m-0 list-none p-0"
                          [attr.aria-label]="categoryName(category.categoryId)"
                        >
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
                      </div>
                    }
                  </div>
                }
              </div>
              @if (leaf().walkthrough; as walkthrough) {
                <details class="border-t border-rule">
                  <summary
                    class="flex min-h-11 cursor-pointer items-center text-[15px] text-fg-muted"
                  >
                    Walkthrough
                  </summary>
                  <app-markdown-view class="block pb-2" [source]="walkthrough" />
                </details>
              }
              <div class="flex flex-wrap justify-end gap-2 pt-1.5">
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
                  <button
                    type="button"
                    class="btn-primary"
                    (click)="actions.requestClear(leafId())"
                  >
                    Clear section
                  </button>
                }
              </div>
            </div>
          }
        </div>
      </section>
    }
    <ng-template #titleTpl>
      @if (state() === 'locked') {
        <span class="sr-only">Locked:</span>
      }
      @if (blurred()) {
        <span class="inline-flex items-center gap-2.5"
          ><span aria-hidden="true" class="redaction" [style.width.px]="barWidth()"></span
          ><span aria-hidden="true" class="text-xs font-normal text-fg-muted">tap to reveal</span
          ><span aria-hidden="true" class="sr-only select-none">{{ leaf().title }}</span
          ><span class="sr-only">Hidden section</span></span
        >
      } @else {
        {{ leaf().title }}
      }
    </ng-template>
    <ng-template #nodeTpl>
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
    </ng-template>
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
  readonly selectRow = output<void>();

  private readonly injector = inject(Injector);
  private readonly toggle = viewChild<ElementRef<HTMLButtonElement>>('toggle');
  protected readonly store = inject(RunStore);

  protected readonly layout = inject(RunLayout);
  protected readonly actions = inject(RunActions);
  private readonly reveals = inject(Reveals);

  private readonly view = computed(() => this.store.view()!);
  private readonly index = computed(() => this.store.index()!);
  protected readonly leaf = computed(() => this.index().sections.get(this.leafId())!);
  protected readonly state = computed(() => this.view().sections.get(this.leafId())!.state);
  protected readonly expanded = computed(() => this.layout.isExpanded(this.leafId()));
  /** The panel body shows when expanded, and always in the two-pane detail. */
  protected readonly open = computed(() => this.expanded() || this.detailPane());
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
  protected readonly cardClasses = computed(() =>
    this.compact() ? 'rounded-l-panel bg-surface-raised' : '',
  );
  protected readonly buttonClasses = computed(() => {
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
    if (this.variant() === 'panel') {
      const base = 'font-display font-bold text-[21px] leading-[25px] break-words ';
      const colour = this.state() === 'current' ? 'text-lamp' : 'text-fg';
      return base + colour + (this.state() === 'cleared' ? ' line-through' : '');
    }
    return this.state() === 'cleared'
      ? 'text-sm truncate line-through decoration-rail-dot'
      : 'text-sm truncate';
  });
  protected readonly panelLabel = computed(() => {
    const name = this.blurred() ? 'Hidden section' : this.leaf().title;
    return this.state() === 'current' ? `${name}, current` : name;
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
      leafId: this.leafId(),
      expanded: this.open(),
      epoch: this.layout.expansionEpoch(this.leafId()),
      version: this.store.run()?.currentVersion,
    }),
    computation: (source, previous) =>
      source.expanded &&
      previous?.source.expanded &&
      previous.source.leafId === source.leafId &&
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
  /** Two-column layout: the first ceil(n / 2) categories on the left. */
  protected readonly categoryColumns = computed(() => {
    const all = this.categories();
    if (this.columns() === 1) return [all];
    const half = Math.ceil(all.length / 2);
    return [all.slice(0, half), all.slice(half)];
  });
  protected readonly openCount = computed(() =>
    this.view()
      .cards.get(this.leafId())!
      .categories.reduce((n, c) => n + c.rows.filter((r) => r.status.kind === 'open').length, 0),
  );

  protected headerClick(): void {
    if (this.detailPane()) this.selectRow.emit();
    else {
      this.layout.setExpanded(this.leafId(), !this.expanded());
      // The list swaps row and panel, which destroys the focused toggle.
      afterNextRender(() => this.toggle()?.nativeElement.focus(), { injector: this.injector });
    }
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
