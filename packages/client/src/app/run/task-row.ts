import {
  Injector,
  afterNextRender,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import type { Task, TaskState, TaskStatus } from '@sweep/core';
import { MarkdownView } from '../shared/markdown-view';
import { Reveals } from './reveals';
import { SpoilerText } from './spoiler-text';
import { taskBlurred, taskRevealKey } from './spoiler';
import { BADGE_CLASS, taskBadges } from './task-badges';

let nextId = 0;

@Component({
  selector: 'app-task-row',
  imports: [MarkdownView, SpoilerText],
  host: {
    class: 'block',
    '(document:pointerdown)': 'onPointerDown($event)',
    '(keydown.escape)': 'onEscape($event)',
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    <div class="flex min-h-[42px] items-center gap-3" [class.text-not-chosen]="notChosen()">
      <label class="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          class="ck"
          [checked]="done()"
          [disabled]="notChosen()"
          [attr.aria-label]="blurred() ? 'Hidden spoiler task' : task().title"
          (change)="toggle($event)"
        />
      </label>
      <div class="min-w-0 grow">
        @if (blurred()) {
          <app-spoiler-text
            [text]="task().title"
            [hidden]="true"
            [revealKey]="revealKey()"
            label="Hidden spoiler task. Tap to reveal."
            (revealed)="focusTitle()"
          />
        } @else {
          @if (task().how) {
            <button
              #title
              type="button"
              class="min-h-11 w-full grow text-left text-[15px] leading-5"
              [class.line-through]="struck()"
              [class.decoration-rail-dot]="struck()"
              [class.text-fg-muted]="resolved() && !notChosen()"
              [class.text-not-chosen]="notChosen()"
              [attr.aria-expanded]="howOpen()"
              [attr.aria-controls]="howOpen() ? howId : null"
              (click)="howOpen.set(!howOpen())"
            >
              {{ task().title }}
            </button>
          } @else {
            <span
              #title
              tabindex="-1"
              class="flex min-h-11 grow items-center text-[15px] leading-5"
              [class.line-through]="struck()"
              [class.decoration-rail-dot]="struck()"
              [class.text-fg-muted]="resolved() && !notChosen()"
              [class.text-not-chosen]="notChosen()"
              >{{ task().title }}</span
            >
          }
        }
        @if (badges().length > 0) {
          <div class="-mt-1 mb-1 flex flex-wrap gap-x-2">
            @for (badge of badges(); track badge.label) {
              <span [class]="badgeClass[badge.tone]">{{ badge.label }}</span>
            }
          </div>
        }
      </div>
      <div #wrap class="relative shrink-0">
        <button
          #trigger
          type="button"
          class="btn-quiet size-11 text-fg-muted"
          [attr.aria-controls]="menuOpen() ? actionsId : null"
          [attr.aria-expanded]="menuOpen()"
          [attr.aria-label]="
            'More actions for ' + (blurred() ? 'hidden spoiler task' : task().title)
          "
          (click)="menuOpen.set(!menuOpen())"
        >
          <span aria-hidden="true">⋯</span>
        </button>
        @if (menuOpen()) {
          <div
            data-actions
            [id]="actionsId"
            class="absolute right-0 top-full z-30 flex min-w-40 flex-col rounded-control border border-border bg-surface-raised py-1 shadow-lg"
          >
            <button type="button" class="min-h-11 px-4 text-left" (click)="choose('dont-care')">
              Don't care
            </button>
            <button type="button" class="min-h-11 px-4 text-left" (click)="choose(null)">
              Reset
            </button>
          </div>
        }
      </div>
    </div>
    @if (task().how; as how) {
      @if (howOpen() && !blurred()) {
        <app-markdown-view
          [id]="howId"
          class="block pb-2 pl-14 pr-11 text-fg-muted"
          [source]="how"
        />
      }
    }
  `,
})
export class TaskRow {
  readonly task = input.required<Task>();
  readonly status = input.required<TaskStatus>();
  readonly secondChance = input(false);
  readonly lastChance = input(false);
  readonly nextChanceLabel = input<string | null>(null);
  readonly stateChange = output<TaskState | null>();

  private readonly injector = inject(Injector);
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');
  private readonly reveals = inject(Reveals);
  private readonly uid = ++nextId;
  protected readonly howId = `how-${this.uid}`;
  protected readonly actionsId = `actions-${this.uid}`;
  private readonly trigger = viewChild<ElementRef<HTMLElement>>('trigger');
  private readonly wrap = viewChild<ElementRef<HTMLElement>>('wrap');
  protected readonly badgeClass = BADGE_CLASS;
  protected readonly howOpen = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly done = computed(() => this.status().kind === 'done');
  protected readonly notChosen = computed(() => this.status().kind === 'not-chosen');
  protected readonly struck = computed(
    () => this.done() || (this.resolved() && this.secondChance()),
  );
  protected readonly resolved = computed(() =>
    ['done', 'dont-care', 'not-chosen'].includes(this.status().kind),
  );
  protected readonly revealKey = computed(() => taskRevealKey(this.task().id));
  protected readonly blurred = computed(() =>
    taskBlurred(this.task(), this.status(), this.reveals.has(taskRevealKey(this.task().id))),
  );
  protected readonly badges = computed(() =>
    taskBadges(this.status(), this.secondChance(), this.lastChance(), this.nextChanceLabel()),
  );

  protected toggle(event: Event): void {
    this.stateChange.emit((event.target as HTMLInputElement).checked ? 'done' : null);
  }

  protected focusTitle(): void {
    // The redaction button is destroyed on reveal; keep focus on the revealed title instead of <body>.
    afterNextRender(() => this.title()?.nativeElement.focus(), { injector: this.injector });
  }

  /** With the menu open Escape closes only the menu, not an enclosing <dialog> sheet. */
  protected onEscape(event: Event): void {
    if (!this.menuOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    this.menuOpen.set(false);
    this.trigger()?.nativeElement.focus();
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && !this.wrap()?.nativeElement.contains(next))
      this.menuOpen.set(false);
  }

  protected onPointerDown(event: Event): void {
    if (this.menuOpen() && !this.wrap()?.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  protected choose(state: TaskState | null): void {
    this.menuOpen.set(false);
    this.trigger()?.nativeElement.focus();
    this.stateChange.emit(state);
  }
}
