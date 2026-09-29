// Normalization (plan phase 6): turns a structurally valid raw guide into the `Guide` model with
// every default resolved, plus a `SourceMap` so later phases can locate sections and tasks. It runs
// only after the reference checks, so every section ID it looks up exists. Unknown keys in `raw`
// (already reported as warnings) are dropped, because only known fields are read.
import type { Category, Guide, Requires, Section, Task, TaskWindow } from '../model/guide.js';
import type { PathSegment } from './locate.js';
import type { RawGuide } from './schema.js';

type RawSection = RawGuide['sections'][number];
type RawTask = NonNullable<RawGuide['tasks']>[number];
type RawRequires = NonNullable<RawSection['requires']>;
type RawWindow = RawTask['windows'][number];

/** Where each section and task ID was written: its YAML path, like `['sections', 1, 'sections', 2]`. */
export interface SourceMap {
  sections: Map<string, PathSegment[]>;
  tasks: Map<string, PathSegment[]>;
}

/** Route-order facts the defaults need: each section's first leaf, and each leaf's predecessor. */
interface RouteFacts {
  firstLeaf: Map<string, string>;
  previousLeaf: Map<string, string | null>;
}

/**
 * Builds the normalized `Guide` from `raw` (plan "Normalization"). `bodyWalkthroughs` holds the
 * walkthroughs of a `.md` guide's body by section ID; they fill sections without a `walkthrough`.
 */
export function normalize(
  raw: RawGuide,
  bodyWalkthroughs: Map<string, string>,
): { guide: Guide; sources: SourceMap } {
  const sources: SourceMap = { sections: new Map(), tasks: new Map() };
  const route = routeFacts(raw.sections);
  const sections = raw.sections.map((section, i) =>
    normalizeSection(section, ['sections', i], route, bodyWalkthroughs, sources),
  );
  const tasks = (raw.tasks ?? []).map((task, i) => {
    sources.tasks.set(task.id, ['tasks', i]);
    return normalizeTask(task, route);
  });
  const guide: Guide = {
    formatVersion: raw.sweep,
    game: raw.game,
    title: raw.title ?? raw.game,
    categories: normalizeCategories(raw.categories),
    sections,
    tasks,
  };
  return { guide, sources };
}

/** Walks the section tree depth-first (route order) and records the first leaf and the previous leaf. */
function routeFacts(sections: readonly RawSection[]): RouteFacts {
  const facts: RouteFacts = { firstLeaf: new Map(), previousLeaf: new Map() };
  let previous: string | null = null;
  const visit = (section: RawSection): string => {
    const children = section.sections ?? [];
    let first: string;
    if (children.length === 0) {
      facts.previousLeaf.set(section.id, previous);
      previous = section.id;
      first = section.id;
    } else {
      first = children.map(visit)[0]!;
    }
    facts.firstLeaf.set(section.id, first);
    return first;
  };
  sections.forEach(visit);
  return facts;
}

function normalizeSection(
  raw: RawSection,
  path: PathSegment[],
  route: RouteFacts,
  bodyWalkthroughs: Map<string, string>,
  sources: SourceMap,
): Section {
  sources.sections.set(raw.id, path);
  const children = (raw.sections ?? []).map((child, i) =>
    normalizeSection(child, [...path, 'sections', i], route, bodyWalkthroughs, sources),
  );
  return {
    id: raw.id,
    title: raw.title,
    overview: raw.overview,
    walkthrough: cleanProse(raw.walkthrough ?? bodyWalkthroughs.get(raw.id)),
    requires: normalizeRequires(raw.requires, children.length === 0, raw.id, route),
    spoiler: raw.spoiler ?? false,
    renamedFrom: normalizeRenamedFrom(raw.renamed_from),
    children,
  };
}

/**
 * A list becomes all-of, `{any}` stays any-of. Omitted on a leaf, it's the previous leaf in route
 * order (none for the first leaf). Omitted on a group, it's empty.
 */
function normalizeRequires(
  raw: RawRequires | undefined,
  isLeaf: boolean,
  id: string,
  route: RouteFacts,
): Requires {
  if (raw === undefined) {
    const previous = isLeaf ? route.previousLeaf.get(id) : null;
    return { all: previous == null ? [] : [previous] };
  }
  return Array.isArray(raw) ? { all: [...raw] } : { any: [...raw.any] };
}

function normalizeTask(raw: RawTask, route: RouteFacts): Task {
  return {
    id: raw.id,
    title: raw.title,
    category: raw.category,
    how: cleanProse(raw.how),
    windows: raw.windows.map((window) => normalizeWindow(window, raw.id, route)),
    exclusive: raw.exclusive ?? null,
    spoiler: raw.spoiler ?? false,
    renamedFrom: normalizeRenamedFrom(raw.renamed_from),
  };
}

/** `until` defaults to `from`; `home` to the first leaf of `from`. */
function normalizeWindow(raw: RawWindow, taskId: string, route: RouteFacts): TaskWindow {
  let home = raw.home;
  if (home === undefined) {
    home = route.firstLeaf.get(raw.from);
    if (home === undefined) {
      // Reference checks run first and stop on an unknown section, so this is a bug upstream.
      throw new Error(`normalize: task ${taskId} has a window from unknown section ${raw.from}`);
    }
  }
  return { from: raw.from, until: raw.until ?? raw.from, home };
}

function normalizeCategories(raw: RawGuide['categories']): Category[] {
  return Object.entries(raw ?? {}).map(([id, category]) => ({
    id,
    name: category.name,
    about: category.about,
    tracked: category.tracked ?? true,
  }));
}

function normalizeRenamedFrom(raw: string | string[] | undefined): string[] {
  if (raw === undefined) return [];
  return typeof raw === 'string' ? [raw] : [...raw];
}

/**
 * Strips leading blank lines and trailing whitespace from a `walkthrough` or `how`, so a YAML `|`
 * block and a `.md` body section compare equal. Empty (or absent) becomes `null`.
 */
function cleanProse(text: string | undefined): string | null {
  if (text === undefined) return null;
  const cleaned = text.replace(/^(?:[^\S\n]*\n)+/, '').trimEnd();
  return cleaned === '' ? null : cleaned;
}
