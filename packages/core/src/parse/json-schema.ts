import { z } from 'zod';
import { guideSchema, PLAIN_TEXT_SCHEMAS } from './schema.js';

/**
 * The JSON Schema (draft 2020-12) for guide files, generated from the Zod schema. Plain-text fields
 * also accept numbers and booleans, which the validator keeps as written (`game: 1942`), so editors
 * don't flag them (ruling R9). Length bounds stay on the string branch; IDs stay strings.
 */
export function guideJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(guideSchema, {
    target: 'draft-2020-12',
    io: 'input',
    override: ({ zodSchema, jsonSchema }) => {
      if (!PLAIN_TEXT_SCHEMAS.has(zodSchema)) return;
      const text: Record<string, unknown> = { ...jsonSchema };
      for (const key of Object.keys(jsonSchema))
        delete (jsonSchema as Record<string, unknown>)[key];
      jsonSchema.anyOf = [text, { type: 'number' }, { type: 'boolean' }];
    },
  }) as Record<string, unknown>;
  const { $schema, ...rest } = generated;
  return {
    $schema,
    title: 'Sweep guide v1',
    description: 'A Sweep guide file. See docs/guide-format.md.',
    ...rest,
  };
}
