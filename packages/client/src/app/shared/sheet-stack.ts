import { Service, computed, signal } from '@angular/core';

/**
 * The open modal sheets, oldest first. A modal <dialog> makes everything outside it inert, so the
 * toast host must live inside the topmost open sheet to stay clickable.
 */
@Service()
export class SheetStack {
  private readonly stack = signal<readonly object[]>([]);
  readonly top = computed<object | null>(() => this.stack().at(-1) ?? null);
  readonly isEmpty = computed(() => this.stack().length === 0);

  push(sheet: object): void {
    this.stack.update((list) => [...list.filter((s) => s !== sheet), sheet]);
  }

  remove(sheet: object): void {
    this.stack.update((list) => (list.includes(sheet) ? list.filter((s) => s !== sheet) : list));
  }

  isTop(sheet: object): boolean {
    return this.top() === sheet;
  }
}
