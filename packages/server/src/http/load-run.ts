import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import type { Database } from '../db/client.js';
import { runs } from '../db/schema.js';
import { ApiErrorCode, HttpError } from './errors.js';
import { getUser, setRun } from './locals.js';
import { UUID_PATTERN } from './validate.js';

/** Ownership guard (spec §6.4): load by id AND user_id; anything else is 404, never 403. */
export function loadRun(db: Database): RequestHandler {
  return async (req, res, next) => {
    const runId = req.params['runId'];
    if (typeof runId !== 'string' || !UUID_PATTERN.test(runId)) {
      throw new HttpError(404, ApiErrorCode.NotFound, 'No such run.');
    }
    const [run] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, runId), eq(runs.userId, getUser(res).id)));
    if (!run) throw new HttpError(404, ApiErrorCode.NotFound, 'No such run.');
    setRun(res, run);
    next();
  };
}
