import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  provideRouter,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
  type UrlTree,
} from '@angular/router';
import { Session } from '../auth/session';
import { RUN_ID, TEST_USER, lanternKeepPayload } from '../../testing/lantern-keep';
import { ResumeCache } from './resume-cache';
import { resumeGuard } from './resume.guard';

async function target(): Promise<string> {
  const tree = (await TestBed.runInInjectionContext(() =>
    resumeGuard({} as ActivatedRouteSnapshot, { url: '/' } as RouterStateSnapshot),
  )) as UrlTree;
  return TestBed.inject(Router).serializeUrl(tree);
}

describe('resumeGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
    TestBed.inject(Session).user.set(TEST_USER);
  });

  it('opens the last run', async () => {
    TestBed.inject(ResumeCache).write(lanternKeepPayload());
    expect(await target()).toBe(`/runs/${RUN_ID}`);
  });

  it('falls back to the runs list', async () => {
    expect(await target()).toBe('/runs');
  });
});
