import type { RequestHandler } from 'express';
import { rateLimit, type Options } from 'express-rate-limit';
import type { RateLimitRule } from '../limits.js';
import { ApiErrorCode } from './errors.js';
import { getUser } from './locals.js';
import { SAFE_METHODS } from './same-origin.js';

const tooMany: Options['handler'] = (_req, res, _next, options) => {
  res.status(options.statusCode).json({
    error: { code: ApiErrorCode.RateLimited, message: 'Too many requests. Try again later.' },
  });
};

/** Each call creates its own MemoryStore, so every createApp has independent counters. */
function common(identifier: string, rule: RateLimitRule): Partial<Options> {
  return {
    identifier,
    limit: rule.limit,
    windowMs: rule.windowMs,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooMany,
  };
}

/** Per IP (the default key, IPv6 /56). GETs such as get-session are not limited. */
export function authRateLimit(rule: RateLimitRule): RequestHandler {
  return rateLimit({ ...common('auth', rule), skip: (req) => SAFE_METHODS.has(req.method) });
}

/** Per signed-in user. Mount after requireSession. */
export function userRateLimit(identifier: 'uploads' | 'api', rule: RateLimitRule): RequestHandler {
  return rateLimit({ ...common(identifier, rule), keyGenerator: (_req, res) => getUser(res).id });
}
