import { fromNodeHeaders } from 'better-auth/node';
import type { RequestHandler } from 'express';
import type { Auth } from '../auth.js';
import { ApiErrorCode, HttpError } from './errors.js';
import { setUser } from './locals.js';

/** Every /api route except health and auth needs a session (spec §6.2). */
export function requireSession(auth: Auth): RequestHandler {
  return async (req, res, next) => {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!result) throw new HttpError(401, ApiErrorCode.Unauthorized, 'Sign in to continue.');
    setUser(res, { id: result.user.id, email: result.user.email, name: result.user.name });
    next();
  };
}
