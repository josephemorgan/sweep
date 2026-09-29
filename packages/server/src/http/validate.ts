import type {
  RenameRunBody,
  SetCategoryBody,
  SetPinBody,
  SetSectionBody,
  SetTaskBody,
} from '@sweep/core';
import { z } from 'zod';
import { ApiErrorCode, HttpError } from './errors.js';

/**
 * Spec §3.3 slug rule, 64 characters or fewer. Copied: core's SLUG_PATTERN
 * (packages/core/src/parse/schema.ts) isn't exported from either core entry point.
 */
export const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
export const ID_MAX_LENGTH = 64;
/** Run IDs are Postgres uuids; anything else is a 404 before Postgres sees it. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RUN_NAME_MAX_LENGTH = 100;

export const idSchema = z.string().max(ID_MAX_LENGTH).regex(ID_PATTERN);
export const runNameSchema = z.string().trim().min(1).max(RUN_NAME_MAX_LENGTH);

export const renameRunBody = z.strictObject({
  name: runNameSchema,
}) satisfies z.ZodType<RenameRunBody>;
export const setSectionBody = z.strictObject({
  cleared: z.boolean(),
}) satisfies z.ZodType<SetSectionBody>;
export const setPinBody = z.strictObject({
  sectionId: idSchema.nullable(),
}) satisfies z.ZodType<SetPinBody>;
export const setTaskBody = z.strictObject({
  state: z.enum(['done', 'dont-care']).nullable(),
}) satisfies z.ZodType<SetTaskBody>;
export const setCategoryBody = z.strictObject({
  tracked: z.boolean().nullable(),
}) satisfies z.ZodType<SetCategoryBody>;

/** For routes that take no query: any query key is 400 (spec §6.4). */
export const noQuery = z.strictObject({});

/** `?dryRun=true` or `?dryRun=false`; nothing else in the query. */
export const dryRunQuery = z
  .strictObject({ dryRun: z.enum(['true', 'false']).optional() })
  .transform((q) => ({ dryRun: q.dryRun === 'true' }));

/** Multipart text fields of POST /api/runs. */
export const createRunFields = z.strictObject({ name: runNameSchema.optional() });

/** Multipart text fields of POST /api/runs/:runId/guide. Multipart values are strings. */
export const updateGuideFields = z.strictObject({
  baseVersion: z
    .string()
    .regex(/^[1-9][0-9]{0,8}$/)
    .transform(Number),
});

/** Parses a body, param or query; anything malformed is 400 bad-request (spec §6.4). */
export function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    // Paths only, never values: values can be user content.
    const where = result.error.issues.map((i) => i.path.join('.') || '(root)').join(', ');
    throw new HttpError(400, ApiErrorCode.BadRequest, `Malformed request: ${where}.`);
  }
  return result.data;
}
