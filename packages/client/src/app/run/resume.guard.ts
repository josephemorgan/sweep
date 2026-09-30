import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { Session } from '../auth/session';
import { ResumeCache } from './resume-cache';

/** Launch opens the last run (spec §5.7 "Resume"), otherwise the runs list. */
export const resumeGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const cache = inject(ResumeCache);
  await inject(Session).ensure();
  const runId = cache.lastRunId();
  return router.createUrlTree(runId ? ['/runs', runId] : ['/runs']);
};
