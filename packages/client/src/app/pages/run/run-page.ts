import {
  Component,
  DOCUMENT,
  Injector,
  afterNextRender,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import type { ClearImpact } from '@sweep/core';
import { ConfirmSheet } from '../../shared/confirm-sheet';
import { Sheet } from '../../shared/sheet';
import { Toasts } from '../../shared/toasts';
import { UnsavedBadge } from '../../shared/unsaved-badge';
import { BottomBar } from '../../run/bottom-bar';
import { ClearDialog } from '../../run/clear-dialog';
import { lockReason } from '../../run/lock-reason';
import { Reveals } from '../../run/reveals';
import { RunActions } from '../../run/run-actions';
import { RunLayout } from '../../run/run-layout';
import { RunMenu } from '../../run/run-menu';
import { RunStore } from '../../run/run-store';
import { UpdateGuideSheet } from '../../run/update-guide-sheet';
import { SectionList } from '../../run/section-list';
import { sectionLabel } from '../../run/spoiler';

@Component({
  selector: 'app-run-page',
  imports: [
    RouterLink,
    SectionList,
    UnsavedBadge,
    BottomBar,
    ClearDialog,
    ConfirmSheet,
    RunMenu,
    Sheet,
    UpdateGuideSheet,
  ],
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
        <app-run-menu (updateGuide)="updating.set(true)" />
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
          <app-bottom-bar />
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
      <app-sheet
        [heading]="clearHeading()"
        [open]="pendingClear() !== null"
        (openChange)="onClearSheet($event)"
      >
        @if (pendingClear(); as pending) {
          <app-clear-dialog
            [leafId]="pending.leafId"
            [impact]="pending.impact"
            (confirmed)="confirmClear()"
            (cancelled)="pendingClear.set(null)"
          />
        }
      </app-sheet>
      <app-sheet heading="Update guide" [(open)]="updating">
        @if (updating()) {
          <app-update-guide-sheet (done)="onUpdated()" (cancelled)="updating.set(false)" />
        }
      </app-sheet>
      <app-confirm-sheet
        heading="Pin a locked section?"
        [message]="pinMessage()"
        confirmLabel="Pin anyway"
        [open]="pendingPin() !== null"
        (openChange)="onPinSheet($event)"
        (confirmed)="confirmPin()"
      />
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

  protected readonly pendingClear = signal<{ leafId: string; impact: ClearImpact } | null>(null);
  protected readonly pendingPin = signal<string | null>(null);
  protected readonly updating = signal(false);
  protected readonly clearHeading = computed(() => {
    const pending = this.pendingClear();
    return pending ? `Clear ${this.label(pending.leafId)}?` : 'Clear section';
  });
  protected readonly pinMessage = computed(() => {
    const leafId = this.pendingPin();
    const index = this.store.index();
    const view = this.store.view();
    if (leafId === null || !index || !view) return '';
    const reason = lockReason(index, view, leafId);
    const names = reason?.ids.map((id) => this.label(id)).join(', ') ?? '';
    return `${this.label(leafId)} is locked (requires ${names}). Mark it as where you are anyway?`;
  });

  /** §5.4: unlocked with nothing closing clears at once; otherwise confirm in a sheet. */
  requestClear(leafId: string): void {
    const impact = this.store.impactOf(leafId);
    if (!impact) return;
    if (!impact.wasLocked && impact.closing.length === 0) this.clearNow(leafId);
    else this.pendingClear.set({ leafId, impact });
  }

  /** §4.5: pinning a locked leaf asks first. */
  requestPin(leafId: string): void {
    if (this.store.view()?.sections.get(leafId)?.unlocked === false) this.pendingPin.set(leafId);
    else this.store.setPin(leafId);
  }

  protected confirmClear(): void {
    const pending = this.pendingClear();
    this.pendingClear.set(null);
    if (pending) this.clearNow(pending.leafId);
  }

  protected confirmPin(): void {
    const leafId = this.pendingPin();
    this.pendingPin.set(null);
    if (leafId !== null) this.store.setPin(leafId);
  }

  /** §5.8: the new guide version is in; close the sheet and return to the current card. */
  protected onUpdated(): void {
    this.updating.set(false);
    const current = this.store.view()?.current;
    if (current) this.layout.scrollTo(current);
  }

  protected onClearSheet(open: boolean): void {
    if (!open) this.pendingClear.set(null);
  }

  protected onPinSheet(open: boolean): void {
    if (!open) this.pendingPin.set(null);
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
    this.focusHeader(next ?? leafId);
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
    // Restore the pin only if nothing pinned since (the clear left it null).
    if (previousPin === leafId && (this.store.progress()?.pin ?? null) === null) {
      this.store.setPin(leafId);
    }
    this.layout.resetLeaves([leafId]);
    this.layout.scrollTo(leafId);
    this.focusHeader(leafId);
  }

  /** The clicked button vanishes when its card collapses, so focus would fall to <body>. */
  private focusHeader(sectionId: string): void {
    afterNextRender(
      () =>
        this.doc
          .querySelector<HTMLElement>(`#section-${sectionId} button[aria-expanded]`)
          ?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }
}
