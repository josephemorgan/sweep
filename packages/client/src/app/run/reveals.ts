import { Service, signal } from '@angular/core';

/** Items revealed by a tap (§5.6). Session-only by design: never persisted. */
@Service()
export class Reveals {
  private readonly keys = signal<ReadonlySet<string>>(new Set());

  has(key: string): boolean {
    return this.keys().has(key);
  }

  reveal(key: string): void {
    if (!this.has(key)) this.keys.update((keys) => new Set(keys).add(key));
  }
}
