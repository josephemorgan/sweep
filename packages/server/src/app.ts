import { basename, join, resolve } from 'node:path';
import express, { type Express } from 'express';
import type { Database } from './db/client.js';
import { errorHandler } from './http/error-handler.js';
import { JSON_BODY_LIMIT_BYTES } from './limits.js';
import { healthRouter } from './routes/health.js';

export interface AppOptions {
  db: Database;
  /** Built Angular app (dist/client/browser). Unset in dev, where ng serve proxies /api. */
  clientDistDir?: string | undefined;
}

const NO_CACHE_FILES = new Set(['index.html', 'ngsw-worker.js', 'ngsw.json']);

export function createApp({ db, clientDistDir }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: JSON_BODY_LIMIT_BYTES }));

  app.use('/api', healthRouter(db));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not-found', message: 'No such API route.' } });
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
    // SPA fallback: every other GET gets index.html (the /api 404 above runs first).
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(root, 'index.html'));
    });
  }

  app.use(errorHandler());

  return app;
}
