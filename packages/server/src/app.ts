import { basename, join, resolve } from 'node:path';
import { toNodeHandler } from 'better-auth/node';
import express, { type Express } from 'express';
import type { Auth } from './auth.js';
import type { Database } from './db/client.js';
import { errorHandler } from './http/error-handler.js';
import { ApiErrorCode, HttpError } from './http/errors.js';
import { requireSession } from './http/require-session.js';
import { JSON_BODY_LIMIT_BYTES } from './limits.js';
import { healthRouter } from './routes/health.js';

export interface AppOptions {
  db: Database;
  auth: Auth;
  /** Built Angular app (dist/client/browser). Unset in dev, where ng serve proxies /api. */
  clientDistDir?: string | undefined;
}

const NO_CACHE_FILES = new Set(['index.html', 'ngsw-worker.js', 'ngsw.json']);

export function createApp(options: AppOptions): Express {
  const { db, auth, clientDistDir } = options;
  const app = express();
  app.disable('x-powered-by');

  // Better Auth reads the raw request stream, so it mounts before express.json().
  app.all('/api/auth/*splat', toNodeHandler(auth));
  app.use(express.json({ limit: JSON_BODY_LIMIT_BYTES }));

  app.use('/api', healthRouter(db));
  app.use('/api', requireSession(auth));
  app.use('/api', () => {
    throw new HttpError(404, ApiErrorCode.NotFound, 'No such API route.');
  });

  if (clientDistDir) {
    const root = resolve(clientDistDir);
    app.use(
      express.static(root, {
        index: false,
        setHeaders(res, path) {
          if (NO_CACHE_FILES.has(basename(path))) res.setHeader('Cache-Control', 'no-cache');
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
