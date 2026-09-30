import {
  effect,
  inject,
  provideEnvironmentInitializer,
  untracked,
  type EnvironmentProviders,
} from '@angular/core';
import { Session } from '../auth/session';
import { RunStore } from '../run/run-store';
import { WriteQueue } from './write-queue';

/** The write queue follows the signed-in user (retry queue rules 6, 12, 13). */
export function provideQueueSession(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const queue = inject(WriteQueue);
    const session = inject(Session);
    const store = inject(RunStore);
    let previous: string | null | undefined;
    effect(() => {
      const userId = session.user()?.id ?? null;
      // setUser reads and writes queue signals: don't let this effect depend on them.
      untracked(() => {
        // The open run belongs to the previous user: never show it to the next one.
        if (previous !== undefined && previous !== userId) store.closeForUserChange();
        previous = userId;
        queue.setUser(userId);
      });
    });
  });
}
