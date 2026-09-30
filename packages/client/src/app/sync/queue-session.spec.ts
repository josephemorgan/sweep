import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiError } from '../api/api-error';
import type { SessionUser } from '../api/auth-api';
import { Session } from '../auth/session';
import { RunsApi } from '../api/runs-api';
import { ResumeCache, resumeKey } from '../run/resume-cache';
import { RunStore } from '../run/run-store';
import { createRunsApiFake } from '../../testing/fake-runs-api';
import { FakeSender } from '../../testing/fake-sender';
import { RUN_ID, TEST_USER, lanternKeepPayload } from '../../testing/lantern-keep';
import { provideQueueSession } from './queue-session';
import type { QueuedWrite } from './queued-write';
import { WRITE_SENDER, WriteQueue, queueStorageKey } from './write-queue';

const write: QueuedWrite = { kind: 'task', runId: 'r1', taskId: 'lost-cat', state: 'done' };
const OTHER: SessionUser = { id: 'u2', email: 'bo@sweep.test', name: 'bo' };

function setup(providers: unknown[] = []): {
  session: Session;
  queue: WriteQueue;
  sender: FakeSender;
} {
  localStorage.clear();
  const sender = new FakeSender();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideQueueSession(),
      ...(providers as never[]),
      { provide: WRITE_SENDER, useValue: sender.send },
    ],
  });
  return { session: TestBed.inject(Session), queue: TestBed.inject(WriteQueue), sender };
}

describe('provideQueueSession (retry queue rules 6, 12, 13)', () => {
  it('loads the signed-in user queue and unloads it on sign-out, keeping it on disk', () => {
    const { session, queue, sender } = setup();
    localStorage.setItem(queueStorageKey(TEST_USER.id), JSON.stringify([write]));
    session.user.set(TEST_USER);
    TestBed.tick();
    expect(queue.pending()).toEqual([write]);
    expect(sender.sent).toHaveLength(1);
    session.user.set(null);
    TestBed.tick();
    expect(queue.size()).toBe(0);
    expect(JSON.parse(localStorage.getItem(queueStorageKey(TEST_USER.id))!)).toEqual([write]);
  });

  it('resumes on sign-in: the same user flushes what a 401 stopped, another user gets their own queue', async () => {
    const { session, queue, sender } = setup();
    localStorage.setItem(queueStorageKey(TEST_USER.id), JSON.stringify([write]));
    const theirs: QueuedWrite = { kind: 'pin', runId: 'r9', sectionId: 'x' };
    localStorage.setItem(queueStorageKey(OTHER.id), JSON.stringify([theirs]));
    session.user.set(TEST_USER);
    TestBed.tick();
    sender.sent[0]!.reject(new ApiError(401, 'unauthorized', 'Sign in.'));
    await vi.waitFor(() => expect(queue.stalled()).toBe(true));
    expect(queue.size()).toBe(1);

    // The session ended, then the same user signs in again: the queue resumes and flushes.
    session.user.set(null);
    TestBed.tick();
    session.user.set(TEST_USER);
    TestBed.tick();
    expect(sender.sent).toHaveLength(2);
    expect(sender.sent[1]!.write).toEqual(write);
    sender.sent[1]!.resolve();
    await vi.waitFor(() => expect(queue.size()).toBe(0));
    expect(localStorage.getItem(queueStorageKey(TEST_USER.id))).toBeNull();

    // Another user's queue loads instead.
    session.user.set(OTHER);
    TestBed.tick();
    expect(queue.pending()).toEqual([theirs]);
  });

  it('does not re-run the user binding when the queue changes', () => {
    const { session, queue, sender } = setup();
    session.user.set(TEST_USER);
    TestBed.tick();
    const setUser = vi.spyOn(queue, 'setUser');
    queue.enqueue(write);
    TestBed.tick();
    queue.enqueue({ ...write, taskId: 'other' });
    TestBed.tick();
    expect(setUser).not.toHaveBeenCalled();
    expect(sender.sent).toHaveLength(1);
  });

  it('closes the open run when the user changes, and never caches it under the next user', async () => {
    const api = createRunsApiFake();
    api.getRun.mockResolvedValue(lanternKeepPayload());
    const { session } = setup([{ provide: RunsApi, useValue: api }]);
    session.user.set(TEST_USER);
    TestBed.tick();
    const store = TestBed.inject(RunStore);
    await store.open(RUN_ID);
    expect(store.view()).not.toBeNull();

    // A refetch left a debounced cache write pending for the old user.
    await store.refetch();
    session.user.set(OTHER);
    TestBed.tick();
    expect(store.runId()).toBeNull();
    expect(store.view()).toBeNull();
    expect(localStorage.getItem(resumeKey(OTHER.id))).toBeNull();
    expect(TestBed.inject(ResumeCache).read(RUN_ID)).toBeNull();

    await store.open(RUN_ID);
    session.user.set(null);
    TestBed.tick();
    expect(store.view()).toBeNull();
    expect(store.runId()).toBeNull();
  });
});
