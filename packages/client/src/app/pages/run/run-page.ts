import {
  Component,
  DOCUMENT,
  Injector,
  afterNextRender,
  effect,
  forwardRef,
  inject,
  input,
  untracked,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Toasts } from '../../shared/toasts';
import { UnsavedBadge } from '../../shared/unsaved-badge';
import { Reveals } from '../../run/reveals';
import { RunActions } from '../../run/run-actions';
import { RunLayout } from '../../run/run-layout';
import { RunStore } from '../../run/run-store';
import { SectionList } from '../../run/section-list';
import { sectionLabel } from '../../run/spoiler';

@Component({
  selector: 'app-run-page',
  imports: [RouterLink, SectionList, UnsavedBadge],
  providers: [RunLayout, { provide: RunActions, useExisting: forwardRef(() => RunPage) }],
  template: `
    <div class="flex min-h-dvh flex-col">
      <header
        class="sticky top-0 z-20 flex items-center gap-1 border-b border-border bg-surface-raised px-1"
      >
        <a routerLink="/runs" class="btn-quiet" aria-label="All runs"
          ><span aria-hidden="true">‹</span></a
        >
        <h1
          class="m-0 min-w-0 flex-1 truncate text-base font-semibold"
          [attr.title]="store.run()?.name ?? null"
        >
          {{ store.run()?.name ?? 'Run' }}
        </h1>
        <app-unsaved-badge />
        <!-- The menu (Update guide, categories, rename) arrives with a later task. -->
        <button type="button" class="btn-quiet" aria-label="Menu" disabled>
          <span aria-hidden="true">☰</span>
        </button>
      </header>
      <main class="mx-auto w-full max-w-[720px] flex-1 px-3 pb-36 pt-2 handheld:pb-16">
        @if (store.view()) {
          @if (store.offline()) {
            <p
              class="m-0 mb-2 rounded-control border border-border px-3 py-2 text-sm text-fg-muted"
            >
              Offline. Showing the last saved copy; changes are queued.
            </p>
          }
          @if (store.guide(); as guide) {
            <app-section-list [sections]="guide.sections" [depth]="0" />
          }
        } @else {
          @switch (store.status()) {
            @case ('not-found') {
              <p>This run no longer exists.</p>
            }
            @case ('failed') {
              <p role="alert" class="text-missed">Couldn't load this run.</p>
              <button type="button" class="btn" (click)="store.refetch()">Try again</button>
            }
            @default {
              <p class="text-fg-muted">Loading run…</p>
            }
          }
        }
      </main>
    </div>
  `,
})
export class RunPage implements RunActions {
  readonly runId = input.required<string>();
  protected readonly store = inject(RunStore);
  protected readonly layout = inject(RunLayout);
  protected readonly toasts = inject(Toasts);
  protected readonly reveals = inject(Reveals);
  private readonly doc = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private scrolledFor: string | null = null;

  constructor() {
    const title = inject(Title);
    effect(() => {
      const id = this.runId();
      untracked(() => void this.store.open(id));
    });
    effect(() => {
      const name = this.store.run()?.name;
      title.setTitle(name ? `${name} · Sweep` : 'Sweep');
    });
    // §5.2 "On open, the view scrolls to the current card": once per run, also from the resume cache.
    effect(() => {
      const view = this.store.view();
      const id = this.runId();
      if (!view || this.store.runId() !== id || this.scrolledFor === id) return;
      this.scrolledFor = id;
      const current = view.current;
      if (current) untracked(() => this.layout.scrollTo(current));
    });
    effect(() => {
      const request = this.layout.scrollRequest();
      if (!request) return;
      afterNextRender(
        () =>
          this.doc.getElementById(`section-${request.id}`)?.scrollIntoView?.({ block: 'start' }),
        { injector: this.injector },
      );
    });
  }

  requestClear(leafId: string): void {
    this.clearNow(leafId);
  }

  requestPin(leafId: string): void {
    this.store.setPin(leafId);
  }

  unpin(): void {
    this.store.setPin(null);
  }

  /** Clear at once, with Undo (§5.4). Then the cleared card collapses and the new current expands. */
  protected clearNow(leafId: string): void {
    const previousPin = this.store.progress()?.pin ?? null;
    const label = this.label(leafId);
    this.store.setCleared(leafId, true);
    const next = this.store.view()?.current ?? null;
    this.layout.resetLeaves([leafId, next]);
    if (next) this.layout.scrollTo(next);
    this.toasts.show(`Cleared ${label}.`, {
      key: 'clear',
      action: { label: 'Undo', run: () => this.undoClear(leafId, previousPin) },
    });
  }

  protected label(sectionId: string): string {
    const index = this.store.index();
    const view = this.store.view();
    return index && view ? sectionLabel(index, view, this.reveals, sectionId) : sectionId;
  }

  private undoClear(leafId: string, previousPin: string | null): void {
    this.store.setCleared(leafId, false);
    if (previousPin === leafId) this.store.setPin(leafId);
    this.layout.resetLeaves([leafId]);
    this.layout.scrollTo(leafId);
  }
}
