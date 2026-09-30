import { Component, computed, inject, signal } from '@angular/core';
import { Sheet } from '../shared/sheet';
import { Metric, METRIC_LABEL, groupByHome, metricTaskIds, type HomeGroup } from './metric-groups';
import { RunStore } from './run-store';

@Component({
  selector: 'app-bottom-bar',
  imports: [Sheet],
  template: `
    <nav
      aria-label="Run metrics"
      class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface-raised"
    >
      <div
        class="mx-auto flex max-w-[720px] flex-col gap-1 px-2 py-1 handheld:flex-row handheld:items-center handheld:py-0"
      >
        <div class="grid flex-1 grid-cols-4 gap-1">
          @for (m of metrics; track m) {
            <button
              type="button"
              class="flex min-h-11 flex-col-reverse items-center justify-center rounded-control handheld:flex-row-reverse handheld:justify-center handheld:gap-2"
              [class.font-semibold]="m === 'closing'"
              [class.text-last-chance]="highlighted(m)"
              [class.border]="highlighted(m)"
              [class.border-last-chance]="highlighted(m)"
              (click)="open.set(m)"
            >
              <span
                class="text-[0.6875rem] tracking-wide"
                [class.text-fg-muted]="!highlighted(m)"
                >{{ labels[m] }}</span
              >{{ ' '
              }}<span class="text-lg leading-tight tabular-nums handheld:text-base">{{
                value(m)
              }}</span>
            </button>
          }
        </div>
        <label class="flex items-center justify-center text-sm">
          <span class="sr-only">Category filter</span>
          <select class="field w-auto rounded-full" (change)="setFilter($event)">
            <option value="" [selected]="store.categoryFilter() === null">All tracked</option>
            @for (category of trackedCategories(); track category.id) {
              <option [value]="category.id" [selected]="store.categoryFilter() === category.id">
                {{ category.name }}
              </option>
            }
          </select>
        </label>
      </div>
    </nav>
    <app-sheet [heading]="sheetHeading()" [open]="open() !== null" (openChange)="onSheet($event)">
      @if (open(); as metric) {
        <div class="p-3">
          @for (group of groups(metric); track group.leafId) {
            <h3 class="m-0 mt-2 text-sm font-semibold">
              {{ store.index()!.sections.get(group.leafId)!.title }}
            </h3>
            <ul class="m-0 list-none p-0">
              @for (id of group.taskIds; track id) {
                <li class="py-1">{{ store.index()!.tasks.get(id)!.title }}</li>
              }
            </ul>
          }
        </div>
      }
    </app-sheet>
  `,
})
export class BottomBar {
  protected readonly store = inject(RunStore);
  protected readonly metrics = Object.values(Metric);
  protected readonly labels = METRIC_LABEL;
  protected readonly open = signal<Metric | null>(null);
  protected readonly sheetHeading = computed(() => {
    const metric = this.open();
    return metric ? METRIC_LABEL[metric] : '';
  });
  protected readonly trackedCategories = computed(() => {
    const tracked = this.store.view()?.tracked;
    return this.store.guide()?.categories.filter((c) => tracked?.has(c.id)) ?? [];
  });

  protected value(metric: Metric): number {
    return this.store.metrics()?.[metric] ?? 0;
  }

  protected highlighted(metric: Metric): boolean {
    return metric === 'lastChance' && this.value(metric) > 0;
  }

  protected groups(metric: Metric): HomeGroup[] {
    const tasks = this.store.metricTasks();
    return tasks
      ? groupByHome(metricTaskIds(tasks, metric), this.store.index()!, this.store.view()!)
      : [];
  }

  protected setFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.store.categoryFilter.set(value === '' ? null : value);
  }

  protected onSheet(open: boolean): void {
    if (!open) this.open.set(null);
  }
}
