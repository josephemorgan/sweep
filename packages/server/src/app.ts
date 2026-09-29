import { basename, join, resolve } from 'node:path';
import { toNodeHandler } from 'better-auth/node';
import express, { type Express } from 'express';
import type { Auth } from './auth.js';
import type { Database } from './db/client.js';
import { renormalizer, type RenormalizerHooks } from './guides/renormalize.js';
import { describeError, errorHandler } from './http/error-handler.js';
import { ApiErrorCode, HttpError } from './http/errors.js';
import { authRateLimit, userRateLimit } from './http/rate-limits.js';
import { requireSession } from './http/require-session.js';
import { sameOriginGuard } from './http/same-origin.js';
import { securityHeaders } from './http/security-headers.js';
import { uploadParser } from './http/upload.js';
import {
  JSON_BODY_LIMIT_BYTES,
  PARSE_TIMEOUT_MS,
  QUOTAS,
  RATE_LIMITS,
  type Quotas,
  type RateLimits,
} from './limits.js';
import { healthRouter } from './routes/health.js';
import { runsRouter } from './routes/runs.js';
import { schemaRouter } from './routes/schema.js';

export interface AppOptions {
  db: Database;
  auth: Auth;
  /** BETTER_AUTH_URL's origin. State-changing /api requests must send it as `Origin`. */
  sameOrigin: string;
  /** Built Angular app (dist/client/browser). Unset in dev, where ng serve proxies /api. */
  clientDistDir?: string | undefined;
  /** Express `trust proxy` hop count (TRUST_PROXY). Default false. */
  trustProxy?: number | false | undefined;
  /** Overrides for the spec §6.4 rate limits. */
  rateLimits?: Partial<RateLimits> | undefined;
  /** Overrides for spec §6.5 quotas. */
  quotas?: Partial<Quotas> | undefined;
  /** Time budget per guide parse (PARSE_TIMEOUT_MS). Default 5 s; tests pass less. */
  parseTimeoutMs?: number | undefined;
  /** Test hook: the parse worker entry to run instead of src/guides/parse-worker. */
  parseWorkerUrl?: URL | undefined;
  /** Test hooks for re-normalization: a wrapped reparse, the backoff clock, joins. */
  renormalize?: RenormalizerHooks | undefined;
}

/**
 * Better Auth's handler with unexpected errors (auth.ts sets onAPIError.throw) logged through
 * describeError, so SQL and params never reach the logs, and answered as our JSON 500.
 */
function safeAuthHandler(auth: Auth): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await auth.handler(request);
    } catch (err) {
      console.error(describeError(err));
      return Response.json(
        { error: { code: ApiErrorCode.Internal, message: 'Internal server error.' } },
        { status: 500 },
      );
    }
  };
}

const NO_CACHE_FILES = new Set(['index.html', 'ngsw-worker.js', 'ngsw.json']);
/** Angular's content-hashed outputs: main-ABCD2345.js, chunk-…, styles-…, media/<name>-HASH.<ext>. */
const IMMUTABLE_ASSET = /-[A-Z0-9]{8}\.[a-z0-9]+$/;

/**
 * Order: helmet, trust proxy, /api/auth (limit + Better Auth), JSON, same-origin, health,
 * schema (public), session guard, per-user limit, routers, /api 404, static/SPA, errors.
 */
export function createApp(options: AppOptions): Express {
  const { db, auth, sameOrigin, clientDistDir } = options;
  const limits: RateLimits = { ...RATE_LIMITS, ...options.rateLimits };
  const quotas: Quotas = { ...QUOTAS, ...options.quotas };
  const parseTimeoutMs = options.parseTimeoutMs ?? PARSE_TIMEOUT_MS;
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders());
  app.set('trust proxy', options.trustProxy ?? false);

  // Better Auth reads the raw request stream, so it mounts before express.json().
  app.use('/api/auth', authRateLimit(limits.auth));
  app.all('/api/auth/*splat', toNodeHandler(safeAuthHandler(auth)));
  app.use(express.json({ limit: JSON_BODY_LIMIT_BYTES }));

  app.use('/api', sameOriginGuard(sameOrigin));

  app.use('/api', healthRouter(db));
  app.use(schemaRouter());
  app.use('/api', requireSession(auth));
  app.use('/api', userRateLimit('api', limits.api));
  app.use(
    '/api',
    runsRouter({
      db,
      quotas,
      uploadLimiter: userRateLimit('uploads', limits.uploads),
      parseUpload: uploadParser({ timeoutMs: parseTimeoutMs, workerUrl: options.parseWorkerUrl }),
      models: renormalizer({
        ...options.renormalize,
        timeoutMs: parseTimeoutMs,
        workerUrl: options.parseWorkerUrl,
      }),
    }),
  );
  app.use('/api', () => {
    throw new HttpError(404, ApiErrorCode.NotFound, 'No such API route.');
  });

  if (clientDistDir) {
    const root = resolve(clientDistDir);
    app.use(
      express.static(root, {
        index: false,
        setHeaders(res, path) {
          const name = basename(path);
          if (NO_CACHE_FILES.has(name)) res.setHeader('Cache-Control', 'no-cache');
          else if (IMMUTABLE_ASSET.test(name)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    // SPA fallback: every other GET gets index.html (the /api handlers above run first).
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(root, 'index.html'));
    });
  }

  app.use(errorHandler());
  return app;
}
