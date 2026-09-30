import { Component, computed, inject, input, output, signal } from '@angular/core';
import type { Task, TaskState, TaskStatus } from '@sweep/core';
import { MarkdownView } from '../shared/markdown-view';
import { Reveals } from './reveals';
import { taskBlurred, taskRevealKey } from './spoiler';
import { BADGE_CLASS, taskBadges } from './task-badges';

@Component({
  selector: 'app-task-row',
  imports: [MarkdownView],
  host: { class: 'block' },
  template: `
    <div class="flex items-start gap-1" [class.opacity-60]="notChosen()">
      <label class="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          class="size-5 accent-accent"
          [checked]="done()"
          [disabled]="notChosen()"
          [attr.aria-label]="blurred() ? 'Hidden spoiler task' : task().title"
          (change)="toggle($event)"
        />
      </label>
      <div class="min-w-0 flex-1">
        @if (blurred()) {
          <button
            type="button"
            class="min-h-11 w-full text-left"
            aria-label="Hidden spoiler task. Tap to reveal."
            (click)="reveal()"
          >
            <span aria-hidden="true" class="select-none blur-md">{{ task().title }}</span>
          </button>
        } @else {
          <button
            type="button"
            class="min-h-11 w-full text-left"
            [class.line-through]="done()"
            [class.text-fg-muted]="resolved()"
            [attr.aria-expanded]="task().how ? howOpen() : null"
            (click)="howOpen.set(!howOpen())"
          >
            {{ task().title }}
          </button>
        }
        @if (badges().length > 0) {
          <div class="-mt-1 mb-1 flex flex-wrap gap-1">
            @for (badge of badges(); track badge.label) {
              <span
                class="rounded-control border px-1.5 text-xs"
                [class]="badgeClass[badge.tone]"
                >{{ badge.label }}</span
              >
            }
          </div>
        }
        @if (task().how; as how) {
          @if (howOpen() && !blurred()) {
            <app-markdown-view class="block pb-2 text-fg-muted" [source]="how" />
          }
        }
      </div>
      <div class="relative shrink-0">
        <button
          type="button"
          class="btn-quiet"
          aria-haspopup="menu"
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
            role="menu"
            tabindex="-1"
            class="absolute right-0 top-full z-30 flex min-w-40 flex-col rounded-control border border-border bg-surface-raised py-1 shadow-lg"
            (keydown.escape)="menuOpen.set(false)"
          >
            <button
              type="button"
              role="menuitem"
              class="min-h-11 px-4 text-left"
              (click)="choose('dont-care')"
            >
              Don't care
            </button>
            <button
              type="button"
              role="menuitem"
              class="min-h-11 px-4 text-left"
              (click)="choose(null)"
            >
              Reset
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class TaskRow {
  readonly task = input.required<Task>();
  readonly status = input.required<TaskStatus>();
  readonly secondChance = input(false);
  readonly lastChance = input(false);
  readonly nextChanceLabel = input<string | null>(null);
  readonly stateChange = output<TaskState | null>();

  private readonly reveals = inject(Reveals);
  protected readonly badgeClass = BADGE_CLASS;
  protected readonly howOpen = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly done = computed(() => this.status().kind === 'done');
  protected readonly notChosen = computed(() => this.status().kind === 'not-chosen');
  protected readonly resolved = computed(() =>
    ['done', 'dont-care', 'not-chosen'].includes(this.status().kind),
  );
  protected readonly blurred = computed(() =>
    taskBlurred(this.task(), this.status(), this.reveals.has(taskRevealKey(this.task().id))),
  );
  protected readonly badges = computed(() =>
    taskBadges(this.status(), this.secondChance(), this.lastChance(), this.nextChanceLabel()),
  );

  protected toggle(event: Event): void {
    this.stateChange.emit((event.target as HTMLInputElement).checked ? 'done' : null);
  }

  protected reveal(): void {
    this.reveals.reveal(taskRevealKey(this.task().id));
  }

  protected choose(state: TaskState | null): void {
    this.menuOpen.set(false);
    this.stateChange.emit(state);
  }
}
