// Keeps the shared demo account away from Better Auth's account endpoints (list-sessions would
// leak other guests' session tokens; revoke-session(s) and update-user would break them).
import { DEMO_USER_EMAIL } from '@sweep/core';
import { fromNodeHeaders } from 'better-auth/node';
import type { RequestHandler } from 'express';
import type { Auth } from '../auth.js';
import { ApiErrorCode, HttpError } from '../http/errors.js';

/** The only Better Auth endpoints the demo account may call. */
const ALLOWED = new Set(['get-session', 'sign-out']);

/** Mounted on /api/auth before Better Auth: the demo account gets a 404 for all but ALLOWED. */
export function demoAuthGuard(auth: Auth): RequestHandler {
  return async (req, _res, next) => {
    const endpoint = req.path.replace(/^\/+|\/+$/g, '');
    if (ALLOWED.has(endpoint)) {
      next();
      return;
    }
    const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (result?.user.email === DEMO_USER_EMAIL) {
      throw new HttpError(404, ApiErrorCode.NotFound, 'No such API route.');
    }
    next();
  };
}
