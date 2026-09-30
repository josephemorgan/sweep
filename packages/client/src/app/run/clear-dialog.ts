import { Component, computed, inject, input, output } from '@angular/core';
import type { ClearImpact } from '@sweep/core';
import { lockReason } from './lock-reason';
import { Reveals } from './reveals';
import { RunStore } from './run-store';
import { sectionLabel, taskBlurred, taskRevealKey } from './spoiler';
import { SpoilerText } from './spoiler-text';

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

@Component({
  selector: 'app-clear-dialog',
  imports: [SpoilerText],
  template: `
    <div class="flex flex-col gap-3 p-4">
      @if (lockedText(); as text) {
        <p class="m-0 rounded-control border border-last-chance p-2 text-sm">{{ text }}</p>
      }
      @if (impact().closing.length > 0) {
        <p class="m-0 font-semibold">{{ closesText() }}</p>
        @for (list of lists(); track list.heading) {
          @if (list.items.length > 0) {
            <section>
              <h3 class="m-0 text-sm font-semibold" [class]="list.tone">{{ list.heading }}</h3>
              <ul class="m-0 list-none p-0">
                @for (item of list.items; track item.taskId) {
                  <li class="flex min-h-11 flex-wrap items-center gap-x-1">
                    <app-spoiler-text
                      [text]="title(item.taskId)"
                      [hidden]="blurred(item.taskId)"
                      [revealKey]="revealKey(item.taskId)"
                      label="Hidden spoiler task. Tap to reveal."
                    />
                    @if (item.nextChance; as next) {
                      {{ ' ' }}<span class="text-fg-muted">· 2nd chance at {{ label(next) }}</span>
                    }
                  </li>
                }
              </ul>
            </section>
          }
        }
      }
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" class="btn" (click)="cancelled.emit()">Cancel</button>
        <button type="button" class="btn-danger" (click)="confirmed.emit()">Clear anyway</button>
      </div>
    </div>
  `,
})
export class ClearDialog {
  readonly leafId = input.required<string>();
  readonly impact = input.required<ClearImpact>();
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly store = inject(RunStore);
  private readonly reveals = inject(Reveals);
  protected readonly revealKey = taskRevealKey;

  protected readonly lockedText = computed(() => {
    if (!this.impact().wasLocked) return null;
    const reason = lockReason(this.store.index()!, this.store.view()!, this.leafId());
    const names = reason?.ids.map((id) => this.label(id)).join(', ') ?? '';
    const requires = reason?.mode === 'any' ? `requires one of ${names}` : `requires ${names}`;
    return `${capitalize(this.label(this.leafId()))} is locked (${requires}). Clear anyway?`;
  });
  protected readonly closesText = computed(() => {
    const n = this.impact().closing.length;
    return `Clearing ${this.label(this.leafId())} closes ${n} open ${n === 1 ? 'task' : 'tasks'}.`;
  });
  protected readonly lists = computed(() => [
    { heading: 'Gone for good', tone: 'text-missed', items: this.impact().lastChance },
    {
      heading: 'Closes until later',
      tone: 'text-fg',
      items: this.impact().closing.filter((c) => c.nextChance !== null),
    },
  ]);

  protected title(taskId: string): string {
    return this.store.index()!.tasks.get(taskId)!.title;
  }

  protected blurred(taskId: string): boolean {
    const task = this.store.index()!.tasks.get(taskId)!;
    return taskBlurred(
      task,
      this.store.view()!.tasks.get(taskId),
      this.reveals.has(taskRevealKey(taskId)),
    );
  }

  protected label(sectionId: string): string {
    return sectionLabel(this.store.index()!, this.store.view()!, this.reveals, sectionId);
  }
}
