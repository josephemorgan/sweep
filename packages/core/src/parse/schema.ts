// The Zod schema for guide files (spec §3.3, §3.7). It is the single source for the structural
// validator and for the generated JSON Schema. Objects are strict so unknown keys surface as
// `unrecognized_keys` issues (validator warnings) and as `additionalProperties: false` for editors.
import { z } from 'zod';
import { LIMITS } from './limits.js';

/** Slug rule for IDs, category keys and exclusive-group names (spec §3.3). */
export const SLUG_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const slug = z.string().max(64).regex(SLUG_PATTERN);
const text = (max: number) => z.string().min(1).max(max);
const idList = z.array(slug).max(LIMITS.requiresIds);
const anyOf = z.strictObject({ any: idList });
const requires = z.union([idList, anyOf]);
const renamedFrom = z.union([slug, z.array(slug).max(LIMITS.renamedFromEntries)]);

const window = z.strictObject({ from: slug, until: slug.optional(), home: slug.optional() });

const section = z
  .strictObject({
    id: slug,
    title: text(120),
    overview: text(500),
    walkthrough: z.string().max(LIMITS.walkthroughChars).optional(),
    requires: requires.optional(),
    spoiler: z.boolean().optional(),
    renamed_from: renamedFrom.optional(),
    get sections() {
      return z.array(section).min(1).optional();
    },
  })
  .meta({ id: 'section' });

const task = z.strictObject({
  id: slug,
  title: text(200),
  category: slug,
  windows: z.array(window).min(1).max(LIMITS.windowsPerTask),
  how: z.string().max(LIMITS.howChars).optional(),
  exclusive: slug.optional(),
  spoiler: z.boolean().optional(),
  renamed_from: renamedFrom.optional(),
});

const category = z.strictObject({
  name: text(40),
  about: text(300),
  tracked: z.boolean().optional(),
});

export const guideSchema = z.strictObject({
  sweep: z.literal(1),
  game: text(120),
  title: text(120).optional(),
  categories: z.record(slug, category).optional(),
  sections: z.array(section).min(1),
  tasks: z.array(task).optional(),
});

/** A guide file as parsed from YAML, before validation. */
export type RawGuide = z.input<typeof guideSchema>;

/** Known keys of each object, for `unknown-key` suggestions. */
export const KNOWN_KEYS: {
  guide: string[];
  category: string[];
  section: string[];
  task: string[];
  window: string[];
  any: string[];
} = {
  guide: Object.keys(guideSchema.shape),
  category: Object.keys(category.shape),
  section: Object.keys(section.shape),
  task: Object.keys(task.shape),
  window: Object.keys(window.shape),
  any: Object.keys(anyOf.shape),
};
