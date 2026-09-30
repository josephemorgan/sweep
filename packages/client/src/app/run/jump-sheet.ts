import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, output } from '@angular/core';
import type { Section } from '@sweep/core';
import { Reveals } from './reveals';
import { RunLayout } from './run-layout';
import { RunStore } from './run-store';
import { sectionBlurred, sectionRevealKey } from './spoiler';

const MAX_INDENT = 6;
const INDENT_STEP = 0.75;

@Component({
  selector: 'app-jump-sheet',
  imports: [NgTemplateOutlet],
  template: `
    <ng-template #level let-sections>
      <ul class="m-0 list-none p-0">
        @for (section of sections; track section.id) {
          <li class="border-b border-rule">
            <button
              type="button"
              class="menu-item min-h-12"
              [style.padding-left.rem]="indent(section.id)"
              [class.font-semibold]="section.children.length > 0"
              [attr.aria-current]="section.id === current() ? 'location' : null"
              (click)="jump(section)"
            >
              <span aria-hidden="true" class="flex w-4 shrink-0 items-center justify-center">
                @if (section.id === current()) {
                  <span
                    class="size-3.5 rounded-full bg-lamp"
                    style="box-shadow: 0 0 0 3px var(--color-surface-raised), 0 0 0 4.5px var(--color-rail-ring)"
                  ></span>
                } @else if (locked(section)) {
                  <span
                    class="size-[9px] rounded-full border-[1.5px] border-dashed border-rail-ring"
                  ></span>
                } @else if (cleared(section)) {
                  <span class="size-2 rounded-full bg-rail-dot"></span>
                } @else if (section.children.length === 0) {
                  <span
                    class="size-[9px] rounded-full border-[1.5px] border-solid border-rail-ring"
                  ></span>
                }
              </span>
              @if (hidden(section)) {
                <span aria-hidden="true" class="redaction w-28"></span>
                <span class="sr-only">Hidden section</span>
              } @else {
                {{ section.title }}
                @if (locked(section)) {
                  <span class="sr-only">locked</span>
                }
              }
              @if (section.id === current()) {
                <span class="ml-auto text-sm text-lamp">current</span>
              }
            </button>
            @if (section.children.length > 0) {
              <ng-container *ngTemplateOutlet="level; context: { $implicit: section.children }" />
            }
          </li>
        }
      </ul>
    </ng-template>
    <div class="px-3 pb-3">
      <ng-container *ngTemplateOutlet="level; context: { $implicit: roots() }" />
    </div>
  `,
})
export class JumpSheet {
  /** The chosen section's ID, after the layout was told to scroll to it. */
  readonly jumped = output<string>();
  private readonly store = inject(RunStore);
  private readonly layout = inject(RunLayout);
  private readonly reveals = inject(Reveals);
  /** Children keep file (route) order; the roots come from the core index. */
  protected readonly roots = computed<Section[]>(() => {
    const index = this.store.index();
    if (!index) return [];
    return [...index.sections.values()].filter((s) => index.parent.get(s.id) === null);
  });
  protected readonly current = computed(() => this.store.view()?.current ?? null);

  /** Deep sections stop indenting after MAX_INDENT levels, so titles keep their width on a phone. */
  protected indent(sectionId: string): number {
    const depth = this.store.index()?.ancestors.get(sectionId)?.length ?? 0;
    return 0.75 + Math.min(depth, MAX_INDENT) * INDENT_STEP;
  }

  /** A locked leaf that isn't a hidden spoiler says so (its gate is not a secret). */
  protected locked(section: Section): boolean {
    const view = this.store.view()?.sections.get(section.id);
    return section.children.length === 0 && view?.unlocked === false && view.cleared === false;
  }

  protected cleared(section: Section): boolean {
    return this.store.view()?.sections.get(section.id)?.cleared === true;
  }

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
