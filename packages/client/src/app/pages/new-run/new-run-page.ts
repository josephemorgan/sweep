import { Component, computed, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, maxLength } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import type { DryRunCreateResponseDto } from '@sweep/core';
import { isRetryable, toApiError } from '../../api/api-error';
import { RunsApi } from '../../api/runs-api';
import { guideFileProblem } from '../../shared/guide-file';
import { ValidationReport } from '../../shared/validation-report';

interface Problem {
  message: string;
  retry: boolean;
}

@Component({
  selector: 'app-new-run-page',
  imports: [FormField, FormRoot, RouterLink, ValidationReport],
  template: `
    <header
      class="sticky top-0 z-10 flex items-center gap-1 border-b border-border bg-surface-raised px-1"
    >
      <a routerLink="/runs" class="btn-quiet" aria-label="Back to runs"
        ><span aria-hidden="true">‹</span></a
      >
      <h1 class="m-0 flex-1 text-lg font-semibold">New run</h1>
    </header>
    <main class="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-4">
      <label class="flex flex-col gap-1 text-sm">
        Guide file (.yaml, .yml or .md)
        <input
          type="file"
          class="field py-2"
          accept=".yaml,.yml,.md"
          [disabled]="busy()"
          (change)="onFile($event)"
        />
      </label>
      @if (busy()) {
        <p role="status" class="m-0 text-fg-muted">{{ busyText() }}</p>
      }
      @if (problem(); as p) {
        <div
          role="alert"
          class="flex flex-wrap items-center gap-2 rounded-card border border-missed p-3"
        >
          <p class="m-0 flex-1">{{ p.message }}</p>
          @if (p.retry) {
            <button type="button" class="btn" (click)="retry()">Try again</button>
          }
        </div>
      }
      @if (report(); as r) {
        <app-validation-report [issues]="r.issues" [summary]="r.summary" />
      }
      @if (canCreate()) {
        <form [formRoot]="nameForm" class="flex flex-col gap-3">
          <label class="flex flex-col gap-1 text-sm">
            Run name
            <input type="text" class="field" [formField]="nameForm.name" />
          </label>
          @if (nameForm.name().touched() && nameForm.name().invalid()) {
            <p class="-mt-2 text-sm text-missed">{{ nameForm.name().errors()[0]?.message }}</p>
          }
          <button type="submit" class="btn-primary self-start" [disabled]="busy()">Create</button>
        </form>
      }
    </main>
  `,
})
export class NewRunPage {
  private readonly api = inject(RunsApi);
  private readonly router = inject(Router);
  private file: File | null = null;
  private lastAction: (() => Promise<void>) | null = null;

  protected readonly step = signal<'idle' | 'checking' | 'creating'>('idle');
  protected readonly report = signal<DryRunCreateResponseDto | null>(null);
  protected readonly problem = signal<Problem | null>(null);
  protected readonly busy = computed(() => this.step() !== 'idle');
  protected readonly busyText = computed(() =>
    this.step() === 'checking' ? 'Checking the guide…' : 'Creating the run…',
  );
  protected readonly canCreate = computed(() => {
    const r = this.report();
    return r?.summary != null && r.issues.every((i) => i.severity !== 'error');
  });

  private readonly nameModel = signal({ name: '' });
  protected readonly nameForm = form(
    this.nameModel,
    (p) => {
      maxLength(p.name, 100, { message: 'Use 100 characters or fewer.' });
    },
    { submission: { action: async () => this.create() } },
  );

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Clear the input so picking the same file again (after editing it) fires `change`.
    input.value = '';
    if (file) void this.pick(file);
  }

  async pick(file: File): Promise<void> {
    this.file = file;
    this.report.set(null);
    this.problem.set(null);
    const fileProblem = guideFileProblem(file);
    if (fileProblem !== null) {
      this.problem.set({ message: fileProblem, retry: false });
      return;
    }
    await this.attempt(async () => {
      this.step.set('checking');
      const result = await this.api.dryRunCreate(file);
      this.report.set(result);
      if (result.summary) this.nameModel.set({ name: result.summary.title });
    });
  }

  protected async create(): Promise<void> {
    const file = this.file;
    const title = this.report()?.summary?.title;
    if (!file || title === undefined || !this.canCreate()) return;
    await this.attempt(async () => {
      this.step.set('creating');
      // Read the name when the action runs (a retry sees edits). The server rejects an
      // empty name (400), so an empty one falls back to the default.
      const name = this.nameModel().name.trim() || title;
      const { runId } = await this.api.createRun(file, name);
      await this.router.navigateByUrl(`/runs/${runId}`);
    });
  }

  protected retry(): void {
    if (this.lastAction) void this.attempt(this.lastAction);
  }

  private async attempt(action: () => Promise<void>): Promise<void> {
    this.lastAction = action;
    this.problem.set(null);
    try {
      await action();
    } catch (err) {
      const e = toApiError(err);
      if (e.status === 422 && e.issues.length > 0) {
        this.report.set({ issues: [...e.issues], summary: null });
      } else {
        this.problem.set({ message: e.message, retry: isRetryable(e) });
      }
    } finally {
      this.step.set('idle');
    }
  }
}
