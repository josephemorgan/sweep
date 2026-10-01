import { Injectable, inject, signal } from '@angular/core';
import { RunStore } from './run-store';

/** The 4:3 handheld layout (spec §5.9). */
export const HANDHELD_QUERY = '(orientation: landscape) and (max-height: 800px)';

/**
 * ADR 0016. Two detail-pane columns need the viewport to be wide enough for each column to get
 * about 250px: 340px route pane + 1px border + 48px pane padding + 32px column gap + 2 × 250px
 * ≈ 920px. Below that the detail pane shows one column (the Retroid's CSS viewport is 640px
 * wide). The same threshold drives the narrow styling variant `handheld-narrow` in styles.css,
 * which must stay in step with it.
 */
export const WIDE_DETAIL_QUERY = '(min-width: 920px)';

/** Page-scoped view state: which cards are expanded, which groups collapsed, where to scroll. */
@Injectable()
export class RunLayout {
  private readonly store = inject(RunStore);
  private readonly leafOverrides = signal<ReadonlyMap<string, boolean>>(new Map());
  private readonly groupOverrides = signal<ReadonlyMap<string, boolean>>(new Map());
  private readonly epochs = signal<ReadonlyMap<string, number>>(new Map());
  private seq = 0;
  readonly scrollRequest = signal<{ id: string; seq: number } | null>(null);

  /** A jump-sheet pick of a leaf; the handheld run page shows it in the detail pane. */
  readonly jumpedTo = signal<{ id: string; seq: number } | null>(null);

  jumpTo(leafId: string): void {
    this.jumpedTo.set({ id: leafId, seq: ++this.seq });
  }

  /** §5.2: the current card starts expanded, every other card collapsed; any card can be toggled. */
  isExpanded(leafId: string): boolean {
    return this.leafOverrides().get(leafId) ?? this.store.view()?.current === leafId;
  }

  setExpanded(leafId: string, expanded: boolean): void {
    const before = this.isExpanded(leafId);
    this.leafOverrides.update((m) => new Map(m).set(leafId, expanded));
    if (this.isExpanded(leafId) !== before) this.bump([leafId]);
  }

  /** §5.3: counts every change of a card's effective expansion made through this layout, so its sticky rows end when the card is toggled. */
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
    const leaves = ids.filter((id): id is string => id !== null);
    const before = new Map(leaves.map((id) => [id, this.isExpanded(id)]));
    this.leafOverrides.update((m) => {
      const next = new Map(m);
      for (const id of ids) if (id !== null) next.delete(id);
      return next;
    });
    this.bump(leaves.filter((id) => this.isExpanded(id) !== before.get(id)));
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
