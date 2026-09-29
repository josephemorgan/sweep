// Drizzle schema (spec §6.1). Better Auth owns user/session/account/verification (auth-schema.ts).
import type { Guide } from '@sweep/core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema.js';

export * from './auth-schema.js';

export const GuideContainer = { Yaml: 'yaml', Md: 'md' } as const;
export type GuideContainer = (typeof GuideContainer)[keyof typeof GuideContainer];

export const guideContainer = pgEnum('guide_container', [GuideContainer.Yaml, GuideContainer.Md]);
export const taskState = pgEnum('task_state', ['done', 'dont-care']);

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** → guide_versions.version for this run. */
    currentVersion: integer('current_version').notNull(),
    pinnedSectionId: text('pinned_section_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Bumped on every progress write ("last played"). */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('runs_user_id_idx').on(t.userId),
    check('runs_name_length', sql`char_length(${t.name}) between 1 and 100`),
  ],
);

export const guideVersions = pgTable(
  'guide_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** Original upload name, for display. */
    filename: text('filename').notNull(),
    container: guideContainer('container').notNull(),
    /** The uploaded file: the source of truth. */
    source: text('source').notNull(),
    sourceBytes: integer('source_bytes').notNull(),
    sha256: text('sha256').notNull(),
    /** Normalized Guide cache, re-normalized from `source` when core's MODEL_VERSION changes. */
    model: jsonb('model').$type<Guide>().notNull(),
    modelVersion: integer('model_version').notNull(),
    game: text('game').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('guide_versions_run_id_version_unique').on(t.runId, t.version)],
);

/** A row means the section is cleared. No FK to guide contents: orphaned rows persist. */
export const sectionProgress = pgTable(
  'section_progress',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').notNull(),
    clearedAt: timestamp('cleared_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.sectionId] })],
);

/** No row means no user state. */
export const taskProgress = pgTable(
  'task_progress',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    taskId: text('task_id').notNull(),
    state: taskState('state').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.taskId] })],
);

/** No row means the guide default. */
export const categoryPrefs = pgTable(
  'category_prefs',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    categoryId: text('category_id').notNull(),
    tracked: boolean('tracked').notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.categoryId] })],
);

export type RunRow = typeof runs.$inferSelect;
export type GuideVersionRow = typeof guideVersions.$inferSelect;
