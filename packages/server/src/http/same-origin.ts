import type { RequestHandler } from 'express';
import { ApiErrorCode, HttpError } from './errors.js';

export const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Spec §6.4: state-changing /api requests must come from the app's own origin (BETTER_AUTH_URL).
 * Better Auth checks its own routes, which mount before this guard.
 */
export function sameOriginGuard(origin: string): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || req.get('origin') === origin) {
      next();
      return;
    }
    next(new HttpError(403, ApiErrorCode.BadOrigin, 'Cross-origin request refused.'));
  };
}
