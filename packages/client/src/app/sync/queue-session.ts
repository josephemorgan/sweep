import {
  effect,
  inject,
  provideEnvironmentInitializer,
  untracked,
  type EnvironmentProviders,
} from '@angular/core';
import { Session } from '../auth/session';
import { WriteQueue } from './write-queue';

/** The write queue follows the signed-in user (retry queue rules 6, 12, 13). */
export function provideQueueSession(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const queue = inject(WriteQueue);
    const session = inject(Session);
    effect(() => {
      const userId = session.user()?.id ?? null;
      // setUser reads and writes queue signals: don't let this effect depend on them.
      untracked(() => queue.setUser(userId));
    });
  });
}
