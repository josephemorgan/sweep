import { Component, computed, inject, input } from '@angular/core';
import type { Section } from '@sweep/core';
import { GroupHeading } from './group-heading';
import { LeafCard } from './leaf-card';
import { RunLayout } from './run-layout';

@Component({
  selector: 'app-section-list',
  imports: [GroupHeading, LeafCard],
  host: { class: 'block' },
  template: `
    @for (section of sections(); track section.id) {
      @if (section.children.length === 0) {
        <app-leaf-card class="mt-2" [leafId]="section.id" [level]="level()" />
      } @else {
        <app-group-heading [groupId]="section.id" [level]="level()" />
        @if (!layout.isCollapsed(section.id)) {
          <app-section-list
            class="pl-2 handheld:pl-3"
            [sections]="section.children"
            [depth]="depth() + 1"
          />
        }
      }
    }
  `,
})
export class SectionList {
  readonly sections = input.required<readonly Section[]>();
  readonly depth = input(0);
  protected readonly layout = inject(RunLayout);
  /** Below the page h1; never past the last ARIA heading level. */
  protected readonly level = computed(() => Math.min(this.depth() + 2, 6));
}
