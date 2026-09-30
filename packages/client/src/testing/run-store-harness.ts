import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { ProgressDto } from '@sweep/core';
import { RunsApi } from '../app/api/runs-api';
import { Session } from '../app/auth/session';
import { RunStore } from '../app/run/run-store';
import { WRITE_SENDER, WriteQueue } from '../app/sync/write-queue';
import { createRunsApiFake, type RunsApiFake } from './fake-runs-api';
import { FakeSender } from './fake-sender';
import { RUN_ID, TEST_USER, lanternKeepPayload } from './lantern-keep';

export interface RunStoreHarness {
  store: RunStore;
  api: RunsApiFake;
  sender: FakeSender;
  queue: WriteQueue;
  router: Router;
}

/** A signed-in RunStore with Lantern Keep open (after the first fetch). Real queue, fake network. */
export async function setupRunStore(
  progress: Partial<ProgressDto> = {},
  providers: Provider[] = [],
): Promise<RunStoreHarness> {
  localStorage.clear();
  const api = createRunsApiFake();
  const sender = new FakeSender();
  api.getRun.mockResolvedValue(lanternKeepPayload(progress));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: RunsApi, useValue: api },
      { provide: WRITE_SENDER, useValue: sender.send },
      ...providers,
    ],
  });
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  TestBed.inject(Session).user.set(TEST_USER);
  const queue = TestBed.inject(WriteQueue);
  queue.setUser(TEST_USER.id);
  const store = TestBed.inject(RunStore);
  await store.open(RUN_ID);
  return { store, api, sender, queue, router };
}
