import { fromNodeHeaders } from 'better-auth/node';
import type { RequestHandler } from 'express';
import type { Auth } from '../auth.js';
import { ApiErrorCode, HttpError } from './errors.js';
import { setUser } from './locals.js';

/**
 * Every /api route except health and auth needs a session (spec §6.2).
 *
 * getSession also slides the session: past Better Auth's updateAge it extends the session's
 * expiry and sets a new session cookie. That Set-Cookie is forwarded, or the browser cookie
 * would keep its sign-in Max-Age and expire while the session row lives on.
 */
export function requireSession(auth: Auth): RequestHandler {
  return async (req, res, next) => {
    const { headers, response: result } = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true,
    });
    for (const cookie of headers.getSetCookie()) res.append('Set-Cookie', cookie);
    if (!result) throw new HttpError(401, ApiErrorCode.Unauthorized, 'Sign in to continue.');
    setUser(res, { id: result.user.id, email: result.user.email, name: result.user.name });
    next();
  };
}
