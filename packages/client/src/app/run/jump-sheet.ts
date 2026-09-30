import { Component, computed, inject, output } from '@angular/core';
import type { Section } from '@sweep/core';
import { Reveals } from './reveals';
import { RunLayout } from './run-layout';
import { RunStore } from './run-store';
import { sectionBlurred, sectionRevealKey } from './spoiler';

interface JumpItem {
  section: Section;
  depth: number;
}

@Component({
  selector: 'app-jump-sheet',
  template: `
    <ul class="m-0 list-none p-2">
      @for (item of items(); track item.section.id) {
        <li>
          <button
            type="button"
            class="menu-item"
            [style.padding-left.rem]="0.75 + item.depth"
            [class.font-semibold]="item.section.children.length > 0"
            [attr.aria-current]="item.section.id === current() ? 'location' : null"
            (click)="jump(item.section)"
          >
            @if (hidden(item.section)) {
              <span aria-hidden="true" class="select-none blur-sm">{{ item.section.title }}</span>
              <span class="sr-only">Hidden section</span>
            } @else {
              {{ item.section.title }}
            }
            @if (item.section.id === current()) {
              <span class="ml-auto text-sm text-accent">current</span>
            }
          </button>
        </li>
      }
    </ul>
  `,
})
export class JumpSheet {
  /** The chosen section's ID, after the layout was told to scroll to it. */
  readonly jumped = output<string>();
  private readonly store = inject(RunStore);
  private readonly layout = inject(RunLayout);
  private readonly reveals = inject(Reveals);
  /** Route order comes from the core index, depth from its ancestors. */
  protected readonly items = computed<JumpItem[]>(() => {
    const index = this.store.index();
    if (!index) return [];
    return [...index.sections.values()].map((section) => ({
      section,
      depth: index.ancestors.get(section.id)?.length ?? 0,
    }));
  });
  protected readonly current = computed(() => this.store.view()?.current ?? null);

  protected hidden(section: Section): boolean {
    return sectionBlurred(
      section,
      this.store.view()?.sections.get(section.id),
      this.reveals.has(sectionRevealKey(section.id)),
    );
  }

  protected jump(section: Section): void {
    if (section.children.length === 0) this.layout.setExpanded(section.id, true);
    else this.layout.setCollapsed(section.id, false);
    this.layout.scrollTo(section.id);
    this.jumped.emit(section.id);
  }
}
