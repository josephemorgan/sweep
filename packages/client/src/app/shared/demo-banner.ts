import { Component, inject } from '@angular/core';
import { Session } from '../auth/session';

/** One quiet line above every page while signed in as the demo user. Not sticky. */
@Component({
  selector: 'app-demo-banner',
  template: `
    @if (session.isDemo()) {
      <p
        role="status"
        class="m-0 border-b border-border bg-surface-raised px-4 py-1 text-center text-sm text-fg-muted"
      >
        Demo — nothing you do here is saved.
      </p>
    }
  `,
})
export class DemoBanner {
  protected readonly session = inject(Session);
}
