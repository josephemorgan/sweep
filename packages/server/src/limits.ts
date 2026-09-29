/**
 * express.json() body limit. Uploads are multipart (multer), so JSON bodies stay small.
 * The 413 test derives its oversize body from this constant.
 */
export const JSON_BODY_LIMIT_BYTES = 100 * 1024;

/**
 * Time budget for one guide parse in its worker thread (spec §6.4), start-up included. Size
 * limits don't bound the parser's CPU time. PARSE_TIMEOUT_MS overrides it; tests pass less.
 */
export const PARSE_TIMEOUT_MS = 5_000;

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimits {
  /** Per IP, non-GET /api/auth/*. */
  auth: RateLimitRule;
  /** Per user, both POST upload routes together. */
  uploads: RateLimitRule;
  /** Per user, every /api call after the session guard, uploads included. */
  api: RateLimitRule;
}

/** Spec §6.4. createApp takes overrides (tests use small limits). */
export const RATE_LIMITS: RateLimits = {
  auth: { limit: 10, windowMs: 60_000 },
  uploads: { limit: 30, windowMs: 60 * 60_000 },
  api: { limit: 600, windowMs: 60_000 },
};

export interface Quotas {
  runsPerUser: number;
  versionsPerRun: number;
  /** Sum of guide_versions.source_bytes over all the user's runs and versions. */
  sourceBytesPerUser: number;
}

/** Spec §6.5. createApp takes overrides (tests use small quotas). */
export const QUOTAS: Quotas = {
  runsPerUser: 50,
  versionsPerRun: 100,
  sourceBytesPerUser: 100 * 1024 * 1024,
};
