import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FORMAT_VERSION, type RunSummaryDto } from '@sweep/core';
import { toApiError } from '../../api/api-error';
import { RunsApi } from '../../api/runs-api';
import { Session } from '../../auth/session';
import { Toasts } from '../../shared/toasts';

type LoadState = 'loading' | 'ready' | 'failed';

@Component({
  selector: 'app-runs-page',
  imports: [DatePipe, RouterLink],
  template: `
    <header
      class="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface-raised px-4 py-1"
    >
      <h1 class="m-0 flex-1 text-lg font-semibold">Runs</h1>
      <a routerLink="/runs/new" class="btn-primary">New run</a>
      <button type="button" class="btn-quiet" (click)="signOut()">Sign out</button>
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
                    class="block min-h-11 rounded-card border border-border bg-surface-raised px-4 py-3"
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
  `,
})
export class RunsPage {
  private readonly api = inject(RunsApi);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  protected readonly formatVersion = FORMAT_VERSION;
  protected readonly state = signal<LoadState>('loading');
  protected readonly runs = signal<readonly RunSummaryDto[]>([]);
  protected readonly error = signal('');

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

  protected async signOut(): Promise<void> {
    try {
      await this.session.signOut();
      await this.router.navigateByUrl('/sign-in');
    } catch (err) {
      this.toasts.show(`Couldn't sign out. ${toApiError(err).message}`);
    }
  }
}
