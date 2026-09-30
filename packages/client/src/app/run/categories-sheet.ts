import { Component, inject } from '@angular/core';
import { RunStore } from './run-store';

@Component({
  selector: 'app-categories-sheet',
  template: `
    <ul class="m-0 list-none p-2">
      @for (category of store.guide()?.categories ?? []; track category.id) {
        <li>
          <label class="flex min-h-11 items-start gap-3 rounded-control px-2 py-2">
            <input
              type="checkbox"
              role="switch"
              class="mt-0.5 size-5 shrink-0 accent-accent"
              [checked]="store.view()?.tracked?.has(category.id) ?? false"
              (change)="toggle(category.id, $event)"
            />
            <span>
              <span class="block font-medium">{{ category.name }}</span>
              <span class="block text-sm text-fg-muted">{{ category.about }}</span>
            </span>
          </label>
        </li>
      }
    </ul>
  `,
})
export class CategoriesSheet {
  protected readonly store = inject(RunStore);

  protected toggle(categoryId: string, event: Event): void {
    this.store.setTracked(categoryId, (event.target as HTMLInputElement).checked);
  }
}
