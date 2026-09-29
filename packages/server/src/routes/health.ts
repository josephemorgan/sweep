import { sql } from 'drizzle-orm';
import { Router } from 'express';
import type { Database } from '../db/client.js';
import { describeError } from '../http/error-handler.js';

export interface HealthBody {
  ok: boolean;
  db: boolean;
}

export function healthRouter(db: Database): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    let dbOk: boolean;
    try {
      await db.execute(sql`select 1`);
      dbOk = true;
    } catch (err) {
      console.error(`health: database check failed: ${describeError(err)}`);
      dbOk = false;
    }
    const body: HealthBody = { ok: dbOk, db: dbOk };
    res.status(dbOk ? 200 : 503).json(body);
  });
  return router;
}
