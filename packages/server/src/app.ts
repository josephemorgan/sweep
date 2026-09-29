import { basename, join, resolve } from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { Database } from './db/client.js';
import { healthRouter } from './routes/health.js';

export interface AppOptions {
  db: Database;
  /** Built Angular app (dist/client/browser). Unset in dev, where ng serve proxies /api. */
  clientDistDir?: string | undefined;
}

const NO_CACHE_FILES = new Set(['index.html', 'ngsw-worker.js', 'ngsw.json']);

function clientErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
  const value = typeof status === 'number' ? status : statusCode;
  return typeof value === 'number' && value >= 400 && value <= 499 ? value : undefined;
}

export function createApp({ db, clientDistDir }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

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

  // Never log the error object: body-parser errors carry the raw request body in `err.body`.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = clientErrorStatus(err);
    if (status !== undefined) {
      // Fixed messages: a JSON.parse error message can quote part of the request body.
      const error =
        status === 413
          ? { code: 'too-large', message: 'Request body too large.' }
          : { code: 'bad-request', message: 'Malformed request.' };
      res.status(status).json({ error });
      return;
    }
    console.error(err instanceof Error ? (err.stack ?? err.message) : 'Unknown error');
    res.status(500).json({ error: { code: 'internal', message: 'Internal server error.' } });
  });

  return app;
}
