// Loads the demo's seeded runs (spec §6.6) once at start-up: packages/server/demo/runs.json
// plus the guide files it names, parsed through the same worker path uploads use.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Guide, RunProgress } from '@sweep/core';
import { z } from 'zod';
import { GuideContainer } from '../db/schema.js';
import { containerFileName, reparse } from '../guides/core-adapter.js';
import { idSchema, runNameSchema } from '../http/validate.js';
import { indexGuide } from '../runs/guide-index.js';
import type { DemoTemplate } from './types.js';

export interface LoadTemplatesOptions {
  /** Directory with runs.json and guides/. Default: the package's demo/ directory. */
  dir?: URL | undefined;
  /** Parse time budget per guide (PARSE_TIMEOUT_MS). */
  timeoutMs?: number | undefined;
  /** Test hook: parse worker entry override (see core-adapter's ParseOptions.workerUrl). */
  workerUrl?: URL | undefined;
}

// src/demo/templates.ts and dist/demo/templates.js are both two levels below the package root.
const DEFAULT_DIR = new URL('../../demo/', import.meta.url);

const seedSchema = z.array(
  z.strictObject({
    name: runNameSchema,
    file: z.string().regex(/^[a-z0-9-]+\.(yaml|yml|md)$/),
    createdDaysAgo: z.number().nonnegative(),
    playedHoursAgo: z.number().nonnegative(),
    pin: idSchema.nullable(),
    cleared: z.array(idSchema),
    tasks: z.record(idSchema, z.enum(['done', 'dont-care'])),
    tracked: z.record(idSchema, z.boolean()),
  }),
);

interface ParsedFile {
  source: string;
  guide: Guide;
  container: GuideContainer;
}

export async function loadDemoTemplates(
  options: LoadTemplatesOptions = {},
): Promise<DemoTemplate[]> {
  const dir = options.dir ?? DEFAULT_DIR;
  const base = dir.href.endsWith('/') ? dir : new URL(`${dir.href}/`);
  const manifest = seedSchema.parse(
    JSON.parse(await readFile(new URL('runs.json', base), 'utf8')) as unknown,
  );

  const parsed = new Map<string, Promise<ParsedFile>>();
  const loadFile = (file: string): Promise<ParsedFile> => {
    let entry = parsed.get(file);
    if (!entry) {
      entry = (async (): Promise<ParsedFile> => {
        const source = await readFile(new URL(`guides/${file}`, base), 'utf8');
        const container = file.endsWith('.md') ? GuideContainer.Md : GuideContainer.Yaml;
        const { result } = await reparse(source, containerFileName(container), {
          timeoutMs: options.timeoutMs,
          workerUrl: options.workerUrl,
        });
        const errors = result.issues.filter((issue) => issue.severity === 'error');
        if (!result.guide || errors.length > 0) {
          const messages = (errors.length > 0 ? errors : result.issues).map((i) => i.message);
          throw new Error(`demo guide ${file} has errors: ${messages.join('; ')}`);
        }
        return { source, guide: result.guide, container };
      })();
      parsed.set(file, entry);
    }
    return entry;
  };

  const templates: DemoTemplate[] = [];
  for (const seed of manifest) {
    const { source, guide, container } = await loadFile(seed.file);
    const index = indexGuide(guide);
    const fail = (id: string, kind: string): never => {
      throw new Error(`demo run "${seed.name}": "${id}" is not a ${kind} in ${seed.file}`);
    };
    for (const id of seed.cleared) if (!index.leaves.has(id)) fail(id, 'leaf section');
    if (seed.pin !== null && !index.leaves.has(seed.pin)) fail(seed.pin, 'leaf section');
    for (const id of Object.keys(seed.tasks)) if (!index.tasks.has(id)) fail(id, 'task');
    for (const id of Object.keys(seed.tracked)) if (!index.categories.has(id)) fail(id, 'category');

    const progress: RunProgress = {
      cleared: new Set(seed.cleared),
      pin: seed.pin,
      tasks: new Map(Object.entries(seed.tasks)),
      tracked: new Map(Object.entries(seed.tracked)),
    };
    templates.push({
      name: seed.name,
      version: {
        version: 1,
        filename: seed.file,
        container,
        source,
        bytes: Buffer.byteLength(source),
        sha256: createHash('sha256').update(source).digest('hex'),
        guide,
      },
      progress,
      createdAgoMs: seed.createdDaysAgo * 86_400_000,
      playedAgoMs: seed.playedHoursAgo * 3_600_000,
    });
  }
  return templates;
}
