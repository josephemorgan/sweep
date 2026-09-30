import {
  Component,
  DOCUMENT,
  Injector,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import {
  FormField,
  FormRoot,
  form,
  maxLength,
  requiredError,
  validate,
} from '@angular/forms/signals';
import { Router } from '@angular/router';
import { toApiError } from '../api/api-error';
import { RunsApi } from '../api/runs-api';
import { ConfirmSheet } from '../shared/confirm-sheet';
import { Sheet } from '../shared/sheet';
import { Toasts } from '../shared/toasts';
import { WriteQueue } from '../sync/write-queue';
import { CategoriesSheet } from './categories-sheet';
import { JumpSheet } from './jump-sheet';
import { ResumeCache } from './resume-cache';
import { RunStore } from './run-store';

export type MenuSheet = 'menu' | 'jump' | 'categories' | 'rename' | 'delete';

const MAX_NAME = 100;

@Component({
  selector: 'app-run-menu',
  imports: [CategoriesSheet, ConfirmSheet, FormField, FormRoot, JumpSheet, Sheet],
  template: `
    <button
      type="button"
      class="btn-quiet"
      aria-label="Run menu"
      aria-haspopup="dialog"
      (click)="sheet.set('menu')"
    >
      <span aria-hidden="true">☰</span>
    </button>
    <app-sheet heading="Run menu" [open]="sheet() === 'menu'" (openChange)="closed($event, 'menu')">
      <ul class="m-0 flex list-none flex-col p-2">
        <li>
          <button type="button" class="menu-item" (click)="sheet.set('jump')">
            Jump to section
          </button>
        </li>
        <li>
          <button type="button" class="menu-item" (click)="sheet.set('categories')">
            Categories
          </button>
        </li>
        <li>
          <button
            type="button"
            class="menu-item"
            [disabled]="!canUpdate()"
            (click)="requestUpdate()"
          >
            <span>Update guide</span>
            @if (!canUpdate()) {
              <span class="ml-auto text-sm text-fg-muted">Waiting for unsaved changes to sync</span>
            }
          </button>
        </li>
        <li>
          <button type="button" class="menu-item" (click)="openRename()">Rename run</button>
        </li>
        <li>
          <button type="button" class="menu-item text-missed" (click)="sheet.set('delete')">
            Delete run
          </button>
        </li>
      </ul>
    </app-sheet>
    <app-sheet
      heading="Jump to section"
      [open]="sheet() === 'jump'"
      (openChange)="closed($event, 'jump')"
    >
      @if (sheet() === 'jump') {
        <app-jump-sheet (jumped)="onJumped($event)" />
      }
    </app-sheet>
    <app-sheet
      heading="Categories"
      [open]="sheet() === 'categories'"
      (openChange)="closed($event, 'categories')"
    >
      @if (sheet() === 'categories') {
        <app-categories-sheet />
      }
    </app-sheet>
    <app-sheet
      heading="Rename run"
      [open]="sheet() === 'rename'"
      (openChange)="closed($event, 'rename')"
    >
      <form [formRoot]="renameForm" class="flex flex-col gap-3 p-4">
        <label class="flex flex-col gap-1 text-sm">
          Run name
          <input type="text" class="field" [formField]="renameForm.name" />
        </label>
        @if (renameForm.name().touched() && renameForm.name().invalid()) {
          <p class="m-0 text-sm text-missed">{{ renameForm.name().errors()[0]?.message }}</p>
        }
        <button type="submit" class="btn-primary self-end">Save</button>
      </form>
    </app-sheet>
    <app-confirm-sheet
      heading="Delete run?"
      [message]="deleteMessage()"
      confirmLabel="Delete run"
      [danger]="true"
      [open]="sheet() === 'delete'"
      (openChange)="closed($event, 'delete')"
      (confirmed)="deleteRun()"
    />
  `,
})
export class RunMenu {
  /** The Update guide item was chosen (Task 24 builds the flow behind it). */
  readonly updateGuide = output<void>();
  protected readonly store = inject(RunStore);
  private readonly queue = inject(WriteQueue);
  private readonly api = inject(RunsApi);
  private readonly cache = inject(ResumeCache);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  protected readonly sheet = signal<MenuSheet | null>(null);
  private readonly renameModel = signal({ name: '' });
  protected readonly renameForm = form(
    this.renameModel,
    (p) => {
      validate(p.name, ({ value }) =>
        value().trim() === '' ? requiredError({ message: 'Name the run.' }) : undefined,
      );
      maxLength(p.name, MAX_NAME, { message: `Use ${MAX_NAME} characters or fewer.` });
    },
    { submission: { action: async () => this.rename() } },
  );
  /** §5.7: a guide update needs every queued write saved first. */
  protected readonly canUpdate = computed(() => this.queue.size() === 0);
  protected readonly deleteMessage = computed(
    () =>
      `Delete “${this.store.run()?.name ?? ''}”? This deletes the run, every guide version and all progress. It can't be undone.`,
  );

  /** Only the sheet that is still the active one may reset the state (switching sheets closes the old one). */
  protected closed(open: boolean, which: MenuSheet): void {
    if (!open && this.sheet() === which) this.sheet.set(null);
  }

  protected openRename(): void {
    this.renameModel.set({ name: this.store.run()?.name ?? '' });
    this.sheet.set('rename');
  }

  protected requestUpdate(): void {
    if (!this.canUpdate()) return;
    this.sheet.set(null);
    this.updateGuide.emit();
  }

  /** The sheet closes, and focus goes to the section's header (the dialog would return it to the ☰ button). */
  protected onJumped(sectionId: string): void {
    this.sheet.set(null);
    afterNextRender(
      () =>
        this.doc
          .querySelector<HTMLElement>(`#section-${sectionId} button[aria-expanded]`)
          ?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }

  private rename(): void {
    const name = this.renameModel().name.trim();
    if (name !== '' && name !== this.store.run()?.name) this.store.rename(name);
    this.sheet.set(null);
  }

  protected async deleteRun(): Promise<void> {
    const run = this.store.run();
    if (!run) return;
    try {
      await this.api.deleteRun(run.id);
    } catch (err) {
      const e = toApiError(err);
      if (e.status !== 404) {
        this.toasts.show(`Couldn't delete the run. ${e.message}`);
        return;
      }
    }
    this.queue.discardRun(run.id);
    // close() flushes the pending cache write, so forget only after it.
    this.store.close();
    this.cache.forget(run.id);
    this.toasts.show(`Deleted ${run.name}.`);
    await this.router.navigateByUrl('/runs');
  }
}
