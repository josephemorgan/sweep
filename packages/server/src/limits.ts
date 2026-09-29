/**
 * express.json() body limit. Uploads are multipart (multer), so JSON bodies stay small.
 * The 413 test derives its oversize body from this constant.
 */
export const JSON_BODY_LIMIT_BYTES = 100 * 1024;

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimits {
  /** Per IP, non-GET /api/auth/*. */
  auth: RateLimitRule;
  /** Per user, both POST upload routes together. */
  uploads: RateLimitRule;
  /** Per user, every other /api call after the session guard. */
  api: RateLimitRule;
}

/** Spec §6.4. createApp takes overrides (tests use small limits). */
export const RATE_LIMITS: RateLimits = {
  auth: { limit: 10, windowMs: 60_000 },
  uploads: { limit: 30, windowMs: 60 * 60_000 },
  api: { limit: 600, windowMs: 60_000 },
};
