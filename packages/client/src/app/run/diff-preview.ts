import { Component, computed, inject, input } from '@angular/core';
import type { GuideDiff, ItemLabel, KindDiff } from '@sweep/core';
import { RunStore } from './run-store';
import { sectionBlurred, sectionRevealKey, taskBlurred, taskRevealKey } from './spoiler';
import { SpoilerText } from './spoiler-text';

type Kind = 'sections' | 'tasks' | 'categories';
const KINDS: readonly { key: Kind; label: string }[] = [
  { key: 'sections', label: 'Sections' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'categories', label: 'Categories' },
];

const size = (k: KindDiff): number =>
  k.added.length + k.removed.length + k.edited.length + k.renamed.length;

export function isEmptyDiff(diff: GuideDiff): boolean {
  const p = diff.progress;
  const progress = p ? p.migrated.length + p.orphaned.length + p.restored.length : 0;
  return size(diff.sections) + size(diff.tasks) + size(diff.categories) + progress === 0;
}

@Component({
  selector: 'app-diff-preview',
  imports: [SpoilerText],
  template: `
    <div class="flex flex-col gap-3">
      @if (empty()) {
        <p class="m-0 font-semibold">No changes. This file matches the current guide.</p>
      } @else {
        @if (diff().likelyRegenerated) {
          <p
            role="alert"
            class="m-0 rounded-card border border-last-chance p-3 font-semibold text-last-chance"
          >
            Most IDs changed. Was this guide regenerated? Progress for {{ orphaned() }}
            {{ orphaned() === 1 ? 'item' : 'items' }} will be orphaned.
          </p>
        }
        @for (kind of kinds; track kind.key) {
          @let d = diff()[kind.key];
          @if (count(d) > 0) {
            <section class="flex flex-col">
              <h3 class="m-0 text-sm font-semibold">
                {{ kind.label }}: {{ d.added.length }} added · {{ d.edited.length }} edited ·
                {{ d.removed.length }} removed · {{ d.renamed.length }} renamed
              </h3>
              @if (d.added.length > 0) {
                <details>
                  <summary class="flex min-h-11 cursor-pointer items-center text-sm">
                    Added ({{ d.added.length }})
                  </summary>
                  <ul class="m-0 list-none py-1 pl-3 text-sm">
                    @for (id of d.added; track id) {
                      <li>
                        <app-spoiler-text
                          [text]="name(kind.key, id)"
                          [hidden]="hidden(kind.key, id)"
                          [revealKey]="key(kind.key, id)"
                        />
                      </li>
                    }
                  </ul>
                </details>
              }
              @if (d.edited.length > 0) {
                <details>
                  <summary class="flex min-h-11 cursor-pointer items-center text-sm">
                    Edited ({{ d.edited.length }})
                  </summary>
                  <ul class="m-0 list-none py-1 pl-3 text-sm">
                    @for (item of d.edited; track item.id) {
                      <li>
                        <app-spoiler-text
                          [text]="name(kind.key, item.id)"
                          [hidden]="hidden(kind.key, item.id)"
                          [revealKey]="key(kind.key, item.id)"
                        />
                        — {{ item.fields.join(', ') }}
                      </li>
                    }
                  </ul>
                </details>
              }
              @if (d.removed.length > 0) {
                <details>
                  <summary class="flex min-h-11 cursor-pointer items-center text-sm">
                    Removed ({{ d.removed.length }})
                  </summary>
                  <ul class="m-0 list-none py-1 pl-3 text-sm">
                    @for (id of d.removed; track id) {
                      <li>
                        <app-spoiler-text
                          [text]="name(kind.key, id)"
                          [hidden]="hidden(kind.key, id)"
                          [revealKey]="key(kind.key, id)"
                        />
                      </li>
                    }
                  </ul>
                </details>
              }
              @if (d.renamed.length > 0) {
                <details>
                  <summary class="flex min-h-11 cursor-pointer items-center text-sm">
                    Renamed ({{ d.renamed.length }})
                  </summary>
                  <ul class="m-0 list-none py-1 pl-3 text-sm">
                    @for (item of d.renamed; track item.to) {
                      <li>
                        <app-spoiler-text
                          [text]="name(kind.key, item.from)"
                          [hidden]="hidden(kind.key, item.from)"
                          [revealKey]="key(kind.key, item.from)"
                        />
                        →
                        <app-spoiler-text
                          [text]="name(kind.key, item.to)"
                          [hidden]="hidden(kind.key, item.to, item.from)"
                          [revealKey]="key(kind.key, item.to)"
                        />
                        @if (item.fields.length > 0) {
                          <span class="text-fg-muted">({{ item.fields.join(', ') }})</span>
                        }
                      </li>
                    }
                  </ul>
                </details>
              }
            </section>
          }
        }
        @if (progressText(); as text) {
          <p class="m-0 text-sm">{{ text }}</p>
        }
      }
    </div>
  `,
})
export class DiffPreview {
  readonly diff = input.required<GuideDiff>();
  private readonly store = inject(RunStore);
  protected readonly kinds = KINDS;
  protected readonly count = size;
  protected readonly empty = computed(() => isEmptyDiff(this.diff()));
  protected readonly orphaned = computed(() => this.diff().progress?.orphaned.length ?? 0);
  protected readonly progressText = computed(() => {
    const p = this.diff().progress;
    if (!p) return null;
    const m = p.migrated.length;
    return `${m} ${m === 1 ? 'entry' : 'entries'} migrated through renames; ${p.orphaned.length} orphaned (kept, restored if the IDs return); ${p.restored.length} restored`;
  });

  /** The diff's own label (Task 9b), own-property only: IDs like `constructor` are plain keys. */
  private label(kind: 'sections' | 'tasks', id: string): ItemLabel | undefined {
    const labels = this.diff().labels[kind];
    return Object.hasOwn(labels, id) ? labels[id] : undefined;
  }

  protected name(kind: Kind, id: string): string {
    if (kind === 'categories') {
      const cats = this.diff().labels.categories;
      return (Object.hasOwn(cats, id) ? cats[id]?.name : undefined) ?? id;
    }
    return this.label(kind, id)?.title ?? id;
  }

  protected key(kind: Kind, id: string): string {
    return kind === 'sections'
      ? sectionRevealKey(id)
      : kind === 'tasks'
        ? taskRevealKey(id)
        : `category:${id}`;
  }

  /**
   * §5.6 on the label's spoiler flag and this run's state. `stateId` is the ID the current guide
   * knows the item by: a rename target passes its source, since progress migrates with it.
   */
  protected hidden(kind: Kind, id: string, stateId: string = id): boolean {
    if (kind === 'categories') return false;
    const label = this.label(kind, id);
    if (!label) return false;
    const view = this.store.view();
    return kind === 'sections'
      ? sectionBlurred(label, view?.sections.get(stateId), false)
      : taskBlurred(label, view?.tasks.get(stateId), false);
  }
}
