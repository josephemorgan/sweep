import { Router } from 'express';
import { guideSchemaJson } from '../guides/core-adapter.js';

export const SCHEMA_PATH = '/schema/sweep-guide.v1.schema.json';

/** Public: authors point their editors at it (spec §7 Deployment). */
export function schemaRouter(): Router {
  const router = Router();
  router.get(SCHEMA_PATH, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(guideSchemaJson());
  });
  return router;
}
