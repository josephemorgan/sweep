import { z } from 'zod';
import { guideSchema } from './schema.js';

/** The JSON Schema (draft 2020-12) for guide files, generated from the Zod schema. */
export function guideJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(guideSchema, {
    target: 'draft-2020-12',
    io: 'input',
  }) as Record<string, unknown>;
  const { $schema, ...rest } = generated;
  return {
    $schema,
    title: 'Sweep guide v1',
    description: 'A Sweep guide file. See docs/guide-format.md.',
    ...rest,
  };
}
