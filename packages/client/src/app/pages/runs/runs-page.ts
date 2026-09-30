import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FORMAT_VERSION, type RunSummaryDto } from '@sweep/core';
import { toApiError } from '../../api/api-error';
import { RunsApi } from '../../api/runs-api';
import { Session } from '../../auth/session';
import { ResumeCache } from '../../run/resume-cache';
import { RunStore } from '../../run/run-store';
import { ConfirmSheet } from '../../shared/confirm-sheet';
import { Toasts } from '../../shared/toasts';
import { UnsavedBadge } from '../../shared/unsaved-badge';
import { WriteQueue } from '../../sync/write-queue';

type LoadState = 'loading' | 'ready' | 'failed';

@Component({
  selector: 'app-runs-page',
  imports: [ConfirmSheet, DatePipe, RouterLink, UnsavedBadge],
  template: `
    <header
      class="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface-raised px-4 py-1"
    >
      <h1 class="m-0 flex-1 text-lg font-semibold">Runs</h1>
      <app-unsaved-badge />
      <a routerLink="/runs/new" class="btn-primary">New run</a>
      <button type="button" class="btn-quiet" [disabled]="signingOut()" (click)="signOut()">
        Sign out
      </button>
    </header>
    <main class="mx-auto w-full max-w-[720px] px-4 py-4">
      @switch (state()) {
        @case ('loading') {
          <p class="text-fg-muted">Loading runs…</p>
        }
        @case ('failed') {
          <p role="alert" class="text-missed">{{ error() }}</p>
          <button type="button" class="btn" (click)="load()">Try again</button>
        }
        @default {
          @if (runs().length === 0) {
            <p class="text-fg-muted">No runs yet. Upload a guide to start one.</p>
          } @else {
            <ul class="m-0 flex list-none flex-col gap-2 p-0">
              @for (run of runs(); track run.id) {
                <li>
                  <a
                    [routerLink]="['/runs', run.id]"
                    class="block min-h-11 rounded-panel border border-border bg-surface-raised px-4 py-3"
                  >
                    <span class="block font-semibold">{{ run.name }}</span>
                    <span class="block text-sm text-fg-muted">{{ run.game }}</span>
                    <span class="mt-1 flex flex-wrap gap-x-4 text-sm text-fg-muted">
                      <span>{{ run.leavesCleared }}/{{ run.leavesTotal }} sections cleared</span>
                      <span>{{ run.tasksDone }}/{{ run.tasksTotal }} tasks done</span>
                      <span>Last played {{ run.updatedAt | date: 'medium' }}</span>
                    </span>
                  </a>
                </li>
              }
            </ul>
          }
        }
      }
    </main>
    <footer class="px-4 py-2 text-xs text-fg-muted">Guide format v{{ formatVersion }}</footer>
    <app-confirm-sheet
      heading="Sign out?"
      [message]="unsavedMessage()"
      confirmLabel="Sign out anyway"
      [(open)]="confirmSignOut"
      (confirmed)="finishSignOut()"
    />
  `,
})
export class RunsPage {
  private readonly api = inject(RunsApi);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly queue = inject(WriteQueue);
  private readonly resume = inject(ResumeCache);
  private readonly runStore = inject(RunStore);
  protected readonly formatVersion = FORMAT_VERSION;
  protected readonly state = signal<LoadState>('loading');
  protected readonly runs = signal<readonly RunSummaryDto[]>([]);
  protected readonly error = signal('');
  protected readonly confirmSignOut = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly unsavedMessage = computed(() => {
    const n = this.queue.size();
    const what = n === 1 ? "1 change hasn't" : `${n} changes haven't`;
    return `${what} been saved yet. They stay on this device and are sent the next time you sign in here.`;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.runs.set(await this.api.listRuns());
      this.state.set('ready');
    } catch (err) {
      this.error.set(toApiError(err).message);
      this.state.set('failed');
    }
  }

  /** Retry queue rule 12: flush, confirm if writes remain, then drop the resume cache and sign out. */
  protected async signOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    await this.queue.flush();
    if (this.queue.size() > 0) {
      this.signingOut.set(false);
      this.confirmSignOut.set(true);
      return;
    }
    await this.finishSignOut();
  }

  protected async finishSignOut(): Promise<void> {
    this.signingOut.set(true);
    // Close the run store first: it flushes its debounced cache write, which clear() must follow.
    // The cache holds guide content, so an explicit sign-out deletes it.
    this.runStore.close();
    this.resume.clear();
    try {
      await this.session.signOut();
      await this.router.navigateByUrl('/sign-in');
    } catch (err) {
      this.toasts.show(`Couldn't sign out. You're still signed in. ${toApiError(err).message}`);
    } finally {
      this.signingOut.set(false);
    }
  }
}
