import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import type { Task, TaskStatus } from '@sweep/core';
import { Metric, groupByHome, metricTaskIds } from './metric-groups';
import { Reveals } from './reveals';
import { RunStore } from './run-store';
import { sectionLabel } from './spoiler';
import { TaskRow } from './task-row';

@Component({
  selector: 'app-metric-sheet',
  imports: [TaskRow],
  template: `
    <div class="px-5 pb-3">
      <p class="m-0 py-3 text-sm text-fg-soft">{{ description() }}</p>
      @for (group of groups(); track group.leafId) {
        <h3 class="m-0 mt-3 text-xs text-fg-muted">{{ label(group.leafId) }}</h3>
        <ul class="m-0 list-none p-0">
          @for (id of group.taskIds; track id) {
            <li class="min-h-12 border-b border-rule">
              <app-task-row
                [task]="task(id)"
                [status]="status(id)"
                [secondChance]="secondChance(id)"
                [lastChance]="store.lastChanceIds().has(id)"
                [nextChanceLabel]="nextChanceLabel(id)"
                (stateChange)="store.setTaskState(id, $event)"
              />
            </li>
          }
        </ul>
      } @empty {
        <p class="m-0 py-2 text-fg-muted">Nothing here right now.</p>
      }
    </div>
  `,
})
export class MetricSheet {
  readonly metric = input.required<Metric>();
  protected readonly store = inject(RunStore);
  private readonly reveals = inject(Reveals);

  /** Rows on screen stay while the sheet is open; new ones are appended (§5.3). */
  private readonly ids = linkedSignal<readonly string[], readonly string[]>({
    source: () => {
      const tasks = this.store.metricTasks();
      return tasks ? metricTaskIds(tasks, this.metric()) : [];
    },
    computation: (next, previous) => {
      const tasks = this.store.index()?.tasks;
      const merged = previous
        ? [...previous.value, ...next.filter((id) => !previous.value.includes(id))]
        : next;
      // A new guide version may have dropped a task the open sheet still lists.
      return merged.filter((id) => tasks?.has(id));
    },
  });
  protected readonly groups = computed(() =>
    groupByHome(this.ids(), this.store.index()!, this.store.view()!),
  );
  protected readonly description = computed(() => {
    const current = this.store.view()?.current ?? null;
    const here = current ? this.label(current) : 'no current section';
    switch (this.metric()) {
      case 'here':
        return `Open tasks at ${here}.`;
      case 'now':
        return 'Every open task.';
      case 'closing':
        return `Tasks that become missed if you clear ${here}.`;
      case 'lastChance':
        return `Tasks gone for good if you clear ${here}.`;
    }
  });

  protected task(id: string): Task {
    return this.store.index()!.tasks.get(id)!;
  }

  protected status(id: string): TaskStatus {
    return this.store.view()!.tasks.get(id)!;
  }

  protected secondChance(id: string): boolean {
    const status = this.status(id);
    return status.kind === 'open' && status.secondChance;
  }

  protected nextChanceLabel(id: string): string | null {
    const status = this.status(id);
    return status.kind === 'missed' && status.nextChance !== null
      ? this.label(status.nextChance)
      : null;
  }

  protected label(sectionId: string): string {
    return sectionLabel(this.store.index()!, this.store.view()!, this.reveals, sectionId);
  }
}
