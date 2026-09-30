import { Injectable, inject, signal } from '@angular/core';
import { RunStore } from './run-store';

/** Page-scoped view state: which cards are expanded, which groups collapsed, where to scroll. */
@Injectable()
export class RunLayout {
  private readonly store = inject(RunStore);
  private readonly leafOverrides = signal<ReadonlyMap<string, boolean>>(new Map());
  private readonly groupOverrides = signal<ReadonlyMap<string, boolean>>(new Map());
  private readonly epochs = signal<ReadonlyMap<string, number>>(new Map());
  private seq = 0;
  readonly scrollRequest = signal<{ id: string; seq: number } | null>(null);

  /** §5.2: the current card starts expanded, every other card collapsed; any card can be toggled. */
  isExpanded(leafId: string): boolean {
    return this.leafOverrides().get(leafId) ?? this.store.view()?.current === leafId;
  }

  setExpanded(leafId: string, expanded: boolean): void {
    this.leafOverrides.update((m) => new Map(m).set(leafId, expanded));
    this.bump([leafId]);
  }

  /** §5.3: counts every collapse/expand of a card, so its sticky rows end when the card is toggled. */
  expansionEpoch(leafId: string): number {
    return this.epochs().get(leafId) ?? 0;
  }

  private bump(ids: readonly string[]): void {
    this.epochs.update((m) => {
      const next = new Map(m);
      for (const id of ids) next.set(id, (next.get(id) ?? 0) + 1);
      return next;
    });
  }

  /** §5.2: fully cleared groups start collapsed. */
  isCollapsed(groupId: string): boolean {
    return (
      this.groupOverrides().get(groupId) ??
      this.store.view()?.sections.get(groupId)?.cleared === true
    );
  }

  setCollapsed(groupId: string, collapsed: boolean): void {
    this.groupOverrides.update((m) => new Map(m).set(groupId, collapsed));
  }

  /** These leaves follow their state again (§5.4: the cleared card collapses, the new current expands). */
  resetLeaves(ids: readonly (string | null)[]): void {
    this.leafOverrides.update((m) => {
      const next = new Map(m);
      for (const id of ids) if (id !== null) next.delete(id);
      return next;
    });
    this.bump(ids.filter((id): id is string => id !== null));
  }

  scrollTo(sectionId: string): void {
    const ancestors = this.store.index()?.ancestors.get(sectionId) ?? [];
    this.groupOverrides.update((m) => {
      const next = new Map(m);
      for (const id of ancestors) next.set(id, false);
      return next;
    });
    this.scrollRequest.set({ id: sectionId, seq: ++this.seq });
  }
}
