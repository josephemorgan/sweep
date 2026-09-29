import { readFileSync } from 'node:fs';
import type { Guide, RunProgress, TaskState } from '../src/index.js';

export const FIXTURES = new URL('./fixtures/', import.meta.url);
export function readFixture(rel: string): string {
  return readFileSync(new URL(rel, FIXTURES), 'utf8');
}
/** The hand-written expected model for a valid fixture: fixtures/valid/<name>.json. */
export function loadGuide(name: string): Guide {
  return JSON.parse(readFixture(`valid/${name}.json`)) as Guide;
}
export function progress(
  p: {
    cleared?: string[];
    pin?: string | null;
    tasks?: Record<string, TaskState>;
    tracked?: Record<string, boolean>;
  } = {},
): RunProgress {
  return {
    cleared: new Set(p.cleared ?? []),
    pin: p.pin ?? null,
    tasks: new Map(Object.entries(p.tasks ?? {})),
    tracked: new Map(Object.entries(p.tracked ?? {})),
  };
}
