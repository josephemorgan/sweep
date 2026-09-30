import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { RunSummaryDto } from '@sweep/core';
import { ApiError } from '../../api/api-error';
import { RunsApi } from '../../api/runs-api';
import { Session } from '../../auth/session';
import { AuthApi } from '../../api/auth-api';
import { ResumeCache, resumeKey } from '../../run/resume-cache';
import { RunStore } from '../../run/run-store';
import { WriteQueue } from '../../sync/write-queue';
import { setupRunStore } from '../../../testing/run-store-harness';
import { TEST_USER } from '../../../testing/lantern-keep';
import { createRunsApiFake, type RunsApiFake } from '../../../testing/fake-runs-api';
import { RunsPage } from './runs-page';

const RUN: RunSummaryDto = {
  id: 'r1',
  name: 'First playthrough',
  game: 'Lantern Keep',
  title: 'Completionist checklist',
  currentVersion: 1,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-28T18:30:00.000Z',
  leavesCleared: 2,
  leavesTotal: 7,
  tasksDone: 3,
  tasksTotal: 7,
};

async function render(api: RunsApiFake, signOut = vi.fn()) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: RunsApi, useValue: api },
      { provide: Session, useValue: { signOut } },
      { provide: ResumeCache, useValue: { clear: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(RunsPage);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('RunsPage', () => {
  it('lists runs with name, game, progress and a link', async () => {
    const api = createRunsApiFake();
    api.listRuns.mockResolvedValue([RUN]);
    const { el } = await render(api);
    const link = el.querySelector('a[href="/runs/r1"]')!;
    expect(link.textContent).toContain('First playthrough');
    expect(link.textContent).toContain('Lantern Keep');
    expect(link.textContent).toContain('2/7 sections cleared');
    expect(link.textContent).toContain('3/7 tasks done');
    expect(link.textContent).toContain('Last played');
    expect(el.querySelector('a[href="/runs/new"]')?.textContent).toContain('New run');
  });

  it('shows an empty state', async () => {
    const api = createRunsApiFake();
    api.listRuns.mockResolvedValue([]);
    const { el } = await render(api);
    expect(el.textContent).toContain('No runs yet');
  });

  it('shows a load failure with a retry', async () => {
    const api = createRunsApiFake();
    api.listRuns
      .mockRejectedValueOnce(new ApiError(0, 'network', "Can't reach Sweep."))
      .mockResolvedValue([RUN]);
    const { fixture, el } = await render(api);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("Can't reach Sweep.");
    (el.querySelector('button.btn') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.textContent).toContain('First playthrough');
  });

  it('signs out and goes to sign in', async () => {
    const api = createRunsApiFake();
    api.listRuns.mockResolvedValue([]);
    const signOut = vi.fn().mockResolvedValue(undefined);
    const { el } = await render(api, signOut);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Sign out')!.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/sign-in'));
    expect(signOut).toHaveBeenCalled();
  });

  it('asks before signing out with unsaved writes, then clears the resume cache', async () => {
    const api = createRunsApiFake();
    api.listRuns.mockResolvedValue([]);
    const size = signal(1);
    const queue = { size, flush: vi.fn().mockResolvedValue(undefined) };
    const clear = vi.fn();
    const close = vi.fn();
    const signOut = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RunsApi, useValue: api },
        { provide: Session, useValue: { signOut } },
        { provide: WriteQueue, useValue: queue },
        { provide: ResumeCache, useValue: { clear } },
        { provide: RunStore, useValue: { close } },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RunsPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = (name: string): HTMLButtonElement =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
    expect(el.textContent).toContain('1 unsaved');
    button('Sign out').click();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(el.querySelector('dialog[open]')?.textContent).toContain(
        "1 change hasn't been saved yet",
      );
    });
    expect(queue.flush).toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    button('Sign out anyway').click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/sign-in'));
    expect(close).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
  });

  it('leaves the resume cache empty after sign-out even with a debounced cache write pending', async () => {
    let finishSignOut!: () => void;
    const signOut = vi.fn(() => new Promise<void>((resolve) => (finishSignOut = resolve)));
    const { store, api, sender } = await setupRunStore({}, [
      { provide: AuthApi, useValue: { signOut } },
    ]);
    api.listRuns.mockResolvedValue([]);
    store.setTaskState('lost-cat', 'done');
    sender.sent[0]!.resolve();
    await vi.waitFor(() => expect(TestBed.inject(WriteQueue).size()).toBe(0)); // applied: cache write now debounced
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RunsPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Sign out')!.click();
    await vi.waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(localStorage.getItem(resumeKey(TEST_USER.id))).toBeNull();
    // Still signed in (the server call is pending) and past the debounce: nothing may rewrite it.
    await new Promise((r) => setTimeout(r, 700));
    expect(localStorage.getItem(resumeKey(TEST_USER.id))).toBeNull();
    finishSignOut();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/sign-in'));
  });
});
