import { basename, resolve } from 'node:path';
import { DEMO_USER_EMAIL, type DemoSignInResponseDto, type DemoStatusDto } from '@sweep/core';
import { toNodeHandler } from 'better-auth/node';
import express, { type Express } from 'express';
import type { Auth } from './auth.js';
import type { Database } from './db/client.js';
import { demoAuthGuard } from './demo/auth-guard.js';
import { demoRunsRouter } from './demo/router.js';
import { DemoSandboxes } from './demo/sandbox.js';
import type { DemoLimits, DemoTemplate } from './demo/types.js';
import { demoSignIn } from './demo/user.js';
import { renormalizer, type RenormalizerHooks } from './guides/renormalize.js';
import { authBodyLimit } from './http/auth-body.js';
import { describeError, errorHandler } from './http/error-handler.js';
import { ApiErrorCode, HttpError } from './http/errors.js';
import { getUser } from './http/locals.js';
import { authRateLimit, userRateLimit } from './http/rate-limits.js';
import { requireSession } from './http/require-session.js';
import { sameOriginGuard } from './http/same-origin.js';
import { securityHeaders } from './http/security-headers.js';
import { uploadParser } from './http/upload.js';
import {
  AUTH_BODY_LIMIT_BYTES,
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
  /** Turns the demo on (DEMO_ENABLED): seeded runs, the shared secret, and optional limit overrides. */
  demo?:
    | { templates: readonly DemoTemplate[]; secret: string; limits?: Partial<DemoLimits> }
    | undefined;
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
 * Order: helmet, trust proxy, /api/auth (rate limit, body limit, demo auth guard, Better Auth), /api/demo rate
 * limit (the same budget), JSON, same-origin, demo status and sign-in (public), health, schema
 * (public), session guard, per-user limit, runs routers (the demo router for the demo account,
 * the database one for everyone else), /api 404, static/SPA, errors.
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

  // Better Auth mounts before express.json(). authBodyLimit reads its bodies with a size limit
  // (better-call applies none) and hands them over as a string.
  const authLimiter = authRateLimit(limits.auth);
  app.use('/api/auth', authLimiter);
  app.use('/api/auth', authBodyLimit(AUTH_BODY_LIMIT_BYTES));
  if (options.demo) app.use('/api/auth', demoAuthGuard(auth));
  app.all('/api/auth/*splat', toNodeHandler(safeAuthHandler(auth)));
  app.use(express.json({ limit: JSON_BODY_LIMIT_BYTES }));

  // Demo sign-in shares the auth budget (GET /api/demo is skipped as a safe method).
  app.use('/api/demo', authLimiter);
  app.use('/api', sameOriginGuard(sameOrigin));

  app.get('/api/demo', (_req, res) => {
    const body: DemoStatusDto = { enabled: Boolean(options.demo) };
    res.json(body);
  });
  app.post('/api/demo/sign-in', async (_req, res) => {
    if (!options.demo) {
      throw new HttpError(404, ApiErrorCode.NotFound, 'The demo is not enabled.');
    }
    const { headers, user } = await demoSignIn(auth, options.demo.secret);
    for (const cookie of headers.getSetCookie()) res.append('Set-Cookie', cookie);
    const body: DemoSignInResponseDto = { user };
    res.json(body);
  });

  app.use('/api', healthRouter(db));
  app.use(schemaRouter());
  app.use('/api', requireSession(auth));
  app.use('/api', userRateLimit('api', limits.api));
  const dbRuns = runsRouter({
    db,
    quotas,
    uploadLimiter: userRateLimit('uploads', limits.uploads),
    parseUpload: uploadParser({ timeoutMs: parseTimeoutMs, workerUrl: options.parseWorkerUrl }),
    models: renormalizer({
      ...options.renormalize,
      timeoutMs: parseTimeoutMs,
      workerUrl: options.parseWorkerUrl,
    }),
  });
  if (options.demo) {
    const demoRuns = demoRunsRouter({
      sandboxes: new DemoSandboxes(options.demo.templates, { limits: options.demo.limits }),
      uploadLimiter: userRateLimit('uploads', limits.uploads),
      parseUpload: uploadParser({ timeoutMs: parseTimeoutMs, workerUrl: options.parseWorkerUrl }),
    });
    app.use('/api', (req, res, next) => {
      (getUser(res).email === DEMO_USER_EMAIL ? demoRuns : dbRuns)(req, res, next);
    });
  } else {
    // A leftover demo account (the demo was turned off) is signed out, not served from the DB.
    app.use('/api', (_req, res, next) => {
      if (getUser(res).email === DEMO_USER_EMAIL) {
        throw new HttpError(401, ApiErrorCode.Unauthorized, 'Sign in to continue.');
      }
      next();
    });
    app.use('/api', dbRuns);
  }
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
      res.sendFile('index.html', { root });
    });
  }

  app.use(errorHandler());
  return app;
}
