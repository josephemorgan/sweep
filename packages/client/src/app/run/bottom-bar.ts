import { Component, computed, inject, signal } from '@angular/core';
import { Sheet } from '../shared/sheet';
import { Metric, METRIC_LABEL } from './metric-groups';
import { MetricSheet } from './metric-sheet';
import { RunStore } from './run-store';

@Component({
  selector: 'app-bottom-bar',
  imports: [Sheet, MetricSheet],
  template: `
    <nav
      aria-label="Run metrics"
      class="sticky bottom-0 z-20 flex h-16 shrink-0 items-stretch border-t border-rule bg-surface"
    >
      @for (m of metrics; track m) {
        <button
          type="button"
          class="-mt-px flex grow basis-0 flex-col-reverse items-center justify-center border-0 border-t-2 border-transparent"
          [class.font-semibold]="m === 'closing'"
          [class.text-last-chance]="highlighted(m)"
          [class.border-last-chance]="highlighted(m)"
          aria-haspopup="dialog"
          (click)="open.set(m)"
        >
          <span class="text-xs leading-[14px]" [class.text-fg-muted]="!highlighted(m)">{{
            labels[m]
          }}</span
          >{{ ' '
          }}<span class="font-display text-[22px] leading-[26px] font-bold tabular-nums">{{
            value(m)
          }}</span>
        </button>
      }
      <button
        type="button"
        class="flex w-12 shrink-0 items-center justify-center border-l border-rule"
        [class.text-fg-muted]="!filtered()"
        [class.text-accent]="filtered()"
        [attr.aria-label]="filterLabel()"
        aria-haspopup="dialog"
        (click)="filterOpen.set(true)"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 5h18l-7 8v6l-4 2v-8z" />
        </svg>
      </button>
    </nav>
    <app-sheet [heading]="sheetHeading()" [open]="open() !== null" (openChange)="onSheet($event)">
      @if (open(); as metric) {
        <app-metric-sheet [metric]="metric" />
      }
    </app-sheet>
    <app-sheet
      heading="Filter categories"
      [open]="filterOpen()"
      (openChange)="filterOpen.set($event)"
    >
      <ul class="m-0 list-none p-2">
        <li>
          <button
            type="button"
            class="flex min-h-11 w-full items-center px-2 text-left"
            [class.text-accent]="!filtered()"
            [attr.aria-pressed]="!filtered()"
            (click)="setFilter(null)"
          >
            All tracked
          </button>
        </li>
        @for (category of trackedCategories(); track category.id) {
          <li>
            <button
              type="button"
              class="flex min-h-11 w-full items-center px-2 text-left"
              [class.text-accent]="store.activeCategory() === category.id"
              [attr.aria-pressed]="store.activeCategory() === category.id"
              (click)="setFilter(category.id)"
            >
              {{ category.name }}
            </button>
          </li>
        }
      </ul>
    </app-sheet>
  `,
})
export class BottomBar {
  protected readonly store = inject(RunStore);
  protected readonly metrics = Object.values(Metric);
  protected readonly labels = METRIC_LABEL;
  protected readonly open = signal<Metric | null>(null);
  protected readonly filterOpen = signal(false);
  protected readonly filtered = computed(() => this.store.activeCategory() !== null);
  protected readonly filterLabel = computed(() => {
    const id = this.store.activeCategory();
    const name = this.trackedCategories().find((c) => c.id === id)?.name;
    return `Filter categories: ${name ?? 'all tracked'}`;
  });
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

  protected setFilter(id: string | null): void {
    this.store.categoryFilter.set(id);
    this.filterOpen.set(false);
  }

  protected onSheet(open: boolean): void {
    if (!open) this.open.set(null);
  }
}
