import { END, type Guide, type Requires, type Section } from '../model/guide.js';
import type { RunProgress } from '../model/progress.js';

export interface Edited {
  id: string;
  fields: string[];
}
export interface Renamed {
  from: string;
  to: string;
  fields: string[];
}
export interface KindDiff {
  added: string[];
  removed: string[];
  edited: Edited[];
  renamed: Renamed[];
}

export const ProgressKind = {
  Cleared: 'cleared',
  Pin: 'pin',
  Task: 'task',
  Tracked: 'tracked',
} as const;
export type ProgressKind = (typeof ProgressKind)[keyof typeof ProgressKind];

export interface ProgressRef {
  kind: ProgressKind;
  id: string;
}
export interface ProgressMigration {
  kind: ProgressKind;
  from: string;
  to: string;
}
export interface ProgressDiff {
  migrated: ProgressMigration[];
  orphaned: ProgressRef[];
  restored: ProgressRef[];
}
export interface GuideDiff {
  sections: KindDiff;
  tasks: KindDiff;
  categories: KindDiff;
  likelyRegenerated: boolean;
  progress: ProgressDiff | null;
}

const SECTION_FIELDS = ['title', 'overview', 'walkthrough', 'requires', 'spoiler', 'position'];
const TASK_FIELDS = ['title', 'category', 'how', 'windows', 'exclusive', 'spoiler'];
const CATEGORY_FIELDS = ['name', 'about', 'tracked'];

/** Old ID to new ID, for every rename in one kind. */
type RenameMap = Map<string, string>;

interface Matching {
  /** In the new guide's order. */
  added: string[];
  /** In the old guide's order. */
  removed: string[];
  /** Same ID in both, in the new guide's order. */
  matched: string[];
  /** In the new guide's order. */
  renames: { from: string; to: string }[];
}

/** Matches by ID, then by `renamedFrom` (the first entry that is still free wins), within one kind. */
function match(
  oldIds: readonly string[],
  news: readonly { id: string; renamedFrom?: readonly string[] }[],
): Matching {
  const oldSet = new Set(oldIds);
  const newSet = new Set(news.map((n) => n.id));
  const unmatchedOld = new Set(oldIds.filter((id) => !newSet.has(id)));
  const matched: string[] = [];
  const renames: { from: string; to: string }[] = [];
  const added: string[] = [];
  for (const n of news) {
    if (oldSet.has(n.id)) {
      matched.push(n.id);
      continue;
    }
    const from = (n.renamedFrom ?? []).find((id) => unmatchedOld.has(id));
    if (from === undefined) {
      added.push(n.id);
      continue;
    }
    unmatchedOld.delete(from);
    renames.push({ from, to: n.id });
  }
  return { added, removed: oldIds.filter((id) => unmatchedOld.has(id)), matched, renames };
}

function renameMap(m: Matching): RenameMap {
  return new Map(m.renames.map((r) => [r.from, r.to]));
}

/**
 * Parent ID and index among siblings, for every section. `translate` maps an ID into the new
 * guide's ID space, or to null to leave a section out of the sibling count (it has no counterpart
 * in the other guide, so its insertion or removal must not shift the others).
 */
function positions(
  guide: Guide,
  translate: (id: string) => string | null,
): Map<string, { parent: string | null; index: number }> {
  const out = new Map<string, { parent: string | null; index: number }>();
  const walk = (siblings: readonly Section[], parent: string | null): void => {
    let index = 0;
    for (const s of siblings) {
      out.set(s.id, { parent: parent === null ? null : (translate(parent) ?? parent), index });
      if (translate(s.id) !== null) index++;
      walk(s.children, s.id);
    }
  };
  walk(guide.sections, null);
  return out;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function requiresOf(r: Requires, tr: (id: string) => string): Requires {
  return 'all' in r ? { all: r.all.map(tr).sort() } : { any: r.any.map(tr).sort() };
}

function diffKind(m: Matching, fieldsOf: (oldId: string, newId: string) => string[]): KindDiff {
  const edited: Edited[] = [];
  for (const id of m.matched) {
    const fields = fieldsOf(id, id);
    if (fields.length > 0) edited.push({ id, fields });
  }
  return {
    added: m.added,
    removed: m.removed,
    edited,
    renamed: m.renames.map((r) => ({ ...r, fields: fieldsOf(r.from, r.to) })),
  };
}

export function diffGuides(oldGuide: Guide, newGuide: Guide, progress?: RunProgress): GuideDiff {
  void progress; // The progress half comes with Task 19.
  const sec = match(
    flatten(oldGuide.sections).map((s) => s.id),
    flatten(newGuide.sections),
  );
  const tsk = match(
    oldGuide.tasks.map((t) => t.id),
    newGuide.tasks,
  );
  const cat = match(
    oldGuide.categories.map((c) => c.id),
    newGuide.categories,
  );
  const secMap = renameMap(sec);
  const secTr = (id: string): string => secMap.get(id) ?? id;

  const oldSections = new Map(flatten(oldGuide.sections).map((s) => [s.id, s]));
  const newSections = new Map(flatten(newGuide.sections).map((s) => [s.id, s]));
  const addedSections = new Set(sec.added);
  const oldPos = positions(oldGuide, (id) => {
    const to = secTr(id);
    return newSections.has(to) && !addedSections.has(to) ? to : null;
  });
  const newPos = positions(newGuide, (id) => (addedSections.has(id) ? null : id));
  const sections = diffKind(sec, (oldId, newId) => {
    const a = oldSections.get(oldId)!;
    const b = newSections.get(newId)!;
    const pa = oldPos.get(oldId)!;
    const differs: Record<string, boolean> = {
      title: a.title !== b.title,
      overview: a.overview !== b.overview,
      walkthrough: a.walkthrough !== b.walkthrough,
      requires: !same(
        requiresOf(a.requires, secTr),
        requiresOf(b.requires, (id) => id),
      ),
      spoiler: a.spoiler !== b.spoiler,
      position: !same({ parent: pa.parent, index: pa.index }, newPos.get(newId)),
    };
    return SECTION_FIELDS.filter((f) => differs[f]);
  });

  const oldTasks = new Map(oldGuide.tasks.map((t) => [t.id, t]));
  const newTasks = new Map(newGuide.tasks.map((t) => [t.id, t]));
  const tasks = diffKind(tsk, (oldId, newId) => {
    const a = oldTasks.get(oldId)!;
    const b = newTasks.get(newId)!;
    const windows = a.windows.map((w) => ({
      from: secTr(w.from),
      until: w.until === END ? END : secTr(w.until),
      home: secTr(w.home),
    }));
    const differs: Record<string, boolean> = {
      title: a.title !== b.title,
      category: a.category !== b.category,
      how: a.how !== b.how,
      windows: !same(windows, b.windows),
      exclusive: a.exclusive !== b.exclusive,
      spoiler: a.spoiler !== b.spoiler,
    };
    return TASK_FIELDS.filter((f) => differs[f]);
  });

  const oldCats = new Map(oldGuide.categories.map((c) => [c.id, c]));
  const newCats = new Map(newGuide.categories.map((c) => [c.id, c]));
  const categories = diffKind(cat, (oldId, newId) => {
    const a = oldCats.get(oldId)!;
    const b = newCats.get(newId)!;
    const differs: Record<string, boolean> = {
      name: a.name !== b.name,
      about: a.about !== b.about,
      tracked: a.tracked !== b.tracked,
    };
    return CATEGORY_FIELDS.filter((f) => differs[f]);
  });

  const oldCount = oldSections.size + oldTasks.size;
  const removed = sec.removed.length + tsk.removed.length;
  const added = sec.added.length + tsk.added.length;
  const newCount = newSections.size + newTasks.size;
  const likelyRegenerated = oldCount >= 10 && removed / oldCount >= 0.5 && added / newCount >= 0.5;

  return { sections, tasks, categories, likelyRegenerated, progress: null };
}

/** Every section in route order (parents before children). */
function flatten(sections: readonly Section[]): Section[] {
  const out: Section[] = [];
  const walk = (list: readonly Section[]): void => {
    for (const s of list) {
      out.push(s);
      walk(s.children);
    }
  };
  walk(sections);
  return out;
}
