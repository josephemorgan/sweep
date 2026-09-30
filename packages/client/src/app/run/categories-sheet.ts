import { Component, inject } from '@angular/core';
import { RunStore } from './run-store';

@Component({
  selector: 'app-categories-sheet',
  template: `
    <ul class="m-0 list-none px-5 pb-3">
      @for (category of store.guide()?.categories ?? []; track category.id) {
        <li class="border-b border-rule">
          <label class="flex min-h-12 items-start gap-3 py-3">
            <input
              type="checkbox"
              role="switch"
              class="ck mt-0.5"
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
