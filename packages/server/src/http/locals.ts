import type { Response } from 'express';
import type { RunRow } from '../db/schema.js';

/** Typed res.locals accessors (no global declaration merging). */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

const USER_KEY = 'sweepUser';
const RUN_KEY = 'sweepRun';

export function setUser(res: Response, user: SessionUser): void {
  res.locals[USER_KEY] = user;
}

export function getUser(res: Response): SessionUser {
  const user: unknown = res.locals[USER_KEY];
  if (!user) throw new Error('getUser: requireSession has not run for this route.');
  return user as SessionUser;
}

export function setRun(res: Response, run: RunRow): void {
  res.locals[RUN_KEY] = run;
}

export function getRun(res: Response): RunRow {
  const run: unknown = res.locals[RUN_KEY];
  if (!run) throw new Error('getRun: loadRun has not run for this route.');
  return run as RunRow;
}
