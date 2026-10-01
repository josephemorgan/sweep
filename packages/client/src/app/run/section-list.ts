import { Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import type { Section } from '@sweep/core';
import { GroupHeading } from './group-heading';
import { LeafCard } from './leaf-card';
import { Reveals } from './reveals';
import { RunLayout } from './run-layout';
import { RunStore } from './run-store';
import { sectionLabel } from './spoiler';

interface Row {
  section: Section;
  /** Tree depth relative to the top of this list (0 = top level). */
  depth: number;
  leaf: boolean;
}

@Component({
  selector: 'app-section-list',
  imports: [GroupHeading, LeafCard],
  host: { class: 'relative block' },
  template: `
    <div aria-hidden="true" class="absolute left-[19px] top-0 bottom-0 w-[1.5px] bg-rail"></div>
    @for (row of rows(); track row.section.id) {
      @if (row.leaf) {
        <app-leaf-card
          class="block"
          [leafId]="row.section.id"
          [level]="headingLevel(row.depth)"
          [variant]="!detailPane() && layout.isExpanded(row.section.id) ? 'panel' : 'row'"
          [hint]="row.section.id === nextLeafId() ? hint() : null"
          [detailPane]="detailPane()"
          [selected]="detailPane() && row.section.id === selected()"
          (select)="choose(row.section.id)"
        />
      } @else {
        <app-group-heading
          [groupId]="row.section.id"
          [level]="headingLevel(row.depth)"
          [depth]="row.depth + depth() + 1"
        />
      }
    }
  `,
})
export class SectionList {
  readonly sections = input.required<readonly Section[]>();
  readonly depth = input(0);
  readonly detailPane = input(false);
  /** A leaf was tapped in the two-pane layout (leaf id). */
  readonly selectLeaf = output<string>();
  protected readonly layout = inject(RunLayout);
  private readonly store = inject(RunStore);
  private readonly reveals = inject(Reveals);

  /** One flat list in route order, skipping everything under a collapsed group. */
  protected readonly rows = computed<Row[]>(() => {
    const rows: Row[] = [];
    const walk = (sections: readonly Section[], depth: number): void => {
      for (const section of sections) {
        const leaf = section.children.length === 0;
        rows.push({ section, depth, leaf });
        if (!leaf && !this.layout.isCollapsed(section.id)) walk(section.children, depth + 1);
      }
    };
    walk(this.sections(), 0);
    return rows;
  });

  private readonly current = computed(() => this.store.view()?.current ?? null);
  protected readonly selected = linkedSignal<string | null>(() => this.current());

  /** The leaf after current in route order, over all leaves (visible or not). */
  protected readonly nextLeafId = computed(() => {
    const index = this.store.index();
    const current = this.current();
    if (!index || current === null) return null;
    const pos = index.pos.get(current);
    const next = pos === undefined ? null : (index.leaves[pos + 1]?.id ?? null);
    return next !== null && this.store.view()?.sections.get(next)?.cleared ? null : next;
  });

  protected readonly hint = computed(() => {
    const index = this.store.index();
    const view = this.store.view();
    const current = this.current();
    if (!index || !view || current === null) return null;
    return `Opens after ${sectionLabel(index, view, this.reveals, current)}`;
  });

  /** Below the page h1; never past the last ARIA heading level. */
  protected headingLevel(treeDepth: number): number {
    return Math.min(this.depth() + treeDepth + 2, 6);
  }

  protected choose(leafId: string): void {
    this.selected.set(leafId);
    this.selectLeaf.emit(leafId);
  }
}
