import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { toApiError } from '../../api/api-error';
import { Session } from '../../auth/session';
import { Toasts } from '../../shared/toasts';

@Component({
  selector: 'app-runs-page',
  template: `
    <header
      class="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface-raised px-4 py-1"
    >
      <h1 class="m-0 flex-1 text-lg font-semibold">Runs</h1>
      <button type="button" class="btn-quiet" (click)="signOut()">Sign out</button>
    </header>
    <main class="mx-auto w-full max-w-[720px] px-4 py-4"></main>
  `,
})
export class RunsPage {
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);

  protected async signOut(): Promise<void> {
    try {
      await this.session.signOut();
      await this.router.navigateByUrl('/sign-in');
    } catch (err) {
      this.toasts.show(`Couldn't sign out. ${toApiError(err).message}`);
    }
  }
}
