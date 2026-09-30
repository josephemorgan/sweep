import { END, type Guide, type Requires, type Section } from '../model/guide.js';
import type { RunProgress } from '../model/progress.js';
import { ProgressKind } from './progress-kind.js';
import { progressMoves } from './progress-moves.js';

export { ProgressKind };

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
/** A section's or task's display label (spec §5.6 blurs it when `spoiler` is set). */
export interface ItemLabel {
  title: string;
  spoiler: boolean;
}
export interface CategoryLabel {
  name: string;
}
/**
 * Labels for every ID the diff lists: the kind lists, both sides of renames and the progress refs.
 * From the new guide, or from the old guide for IDs only there (removed, rename sources, orphaned).
 * Keys follow the new guide's order (sections in route order), then old-only IDs in the old guide's
 * order. IDs are slugs (never integer-like), so JSON and `Object.keys` keep that order.
 */
export interface DiffLabels {
  sections: Record<string, ItemLabel>;
  tasks: Record<string, ItemLabel>;
  categories: Record<string, CategoryLabel>;
}
export interface GuideDiff {
  sections: KindDiff;
  tasks: KindDiff;
  categories: KindDiff;
  likelyRegenerated: boolean;
  progress: ProgressDiff | null;
  labels: DiffLabels;
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

interface Position {
  /** The parent's ID in the new guide's ID space, or null at the top level. */
  parent: string | null;
  index: number;
}

/** Each section's parent ID (null at the top level), translated by `translate`. */
function parents(guide: Guide, translate: (id: string) => string): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const walk = (siblings: readonly Section[], parent: string | null): void => {
    for (const s of siblings) {
      out.set(s.id, parent === null ? null : translate(parent));
      walk(s.children, s.id);
    }
  };
  walk(guide.sections, null);
  return out;
}

/**
 * Translated parent and index among siblings, for every section. Only `stable` siblings count
 * toward the index: those in both guides under the same translated parent. So inserting, removing
 * or moving one section never shifts the others.
 */
function positions(
  guide: Guide,
  translate: (id: string) => string,
  stable: ReadonlySet<string>,
): Map<string, Position> {
  const out = new Map<string, Position>();
  const walk = (siblings: readonly Section[], parent: string | null): void => {
    let index = 0;
    for (const s of siblings) {
      out.set(s.id, { parent: parent === null ? null : translate(parent), index });
      if (stable.has(s.id)) index++;
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
  const oldParents = parents(oldGuide, secTr);
  const newParents = parents(newGuide, (id) => id);
  const stableOld = new Set<string>();
  const stableNew = new Set<string>();
  const pairs = [...sec.matched.map((id) => ({ from: id, to: id })), ...sec.renames];
  for (const { from, to } of pairs) {
    if (oldParents.get(from) !== newParents.get(to)) continue;
    stableOld.add(from);
    stableNew.add(to);
  }
  const oldPos = positions(oldGuide, secTr, stableOld);
  const newPos = positions(newGuide, (id) => id, stableNew);
  const sections = diffKind(sec, (oldId, newId) => {
    const a = oldSections.get(oldId)!;
    const b = newSections.get(newId)!;
    const pa = oldPos.get(oldId)!;
    const pb = newPos.get(newId)!;
    const differs: Record<string, boolean> = {
      title: a.title !== b.title,
      overview: a.overview !== b.overview,
      walkthrough: a.walkthrough !== b.walkthrough,
      requires: !same(
        requiresOf(a.requires, secTr),
        requiresOf(b.requires, (id) => id),
      ),
      spoiler: a.spoiler !== b.spoiler,
      position: pa.parent !== pb.parent || pa.index !== pb.index,
    };
    return SECTION_FIELDS.filter((f) => differs[f]);
  });

  const oldTasks = new Map(oldGuide.tasks.map((t) => [t.id, t]));
  const newTasks = new Map(newGuide.tasks.map((t) => [t.id, t]));
  const tasks = diffKind(tsk, (oldId, newId) => {
    const a = oldTasks.get(oldId)!;
    const b = newTasks.get(newId)!;
    // Field by field in index order: stored guides (jsonb) don't keep key order.
    const windowsDiffer =
      a.windows.length !== b.windows.length ||
      a.windows.some((w, i) => {
        const v = b.windows[i]!;
        const until = w.until === END ? END : secTr(w.until);
        return secTr(w.from) !== v.from || until !== v.until || secTr(w.home) !== v.home;
      });
    const differs: Record<string, boolean> = {
      title: a.title !== b.title,
      category: a.category !== b.category,
      how: a.how !== b.how,
      windows: windowsDiffer,
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

  const effects =
    progress === undefined
      ? null
      : progressDiff(oldGuide, newGuide, progress, sections.renamed, tasks.renamed);
  return {
    sections,
    tasks,
    categories,
    likelyRegenerated,
    progress: effects,
    labels: diffLabels(oldGuide, newGuide, { sections, tasks, categories }, effects),
  };
}

type LabelKind = keyof DiffLabels;

const LABEL_KIND: Record<ProgressKind, LabelKind> = {
  [ProgressKind.Cleared]: 'sections',
  [ProgressKind.Pin]: 'sections',
  [ProgressKind.Task]: 'tasks',
  [ProgressKind.Tracked]: 'categories',
};

/** Every ID one kind's diff lists: added, removed, edited and both sides of renames. */
function listedIds(d: KindDiff): Set<string> {
  return new Set([
    ...d.added,
    ...d.removed,
    ...d.edited.map((e) => e.id),
    ...d.renamed.flatMap((r) => [r.from, r.to]),
  ]);
}

/**
 * `label(item)` for each wanted ID: new-guide items first, then old-only ones, each list in file
 * order. A `seen` set, not `id in out`: an ID like `constructor` is inherited by every object.
 */
function labelsFor<T extends { id: string }, L>(
  wanted: ReadonlySet<string>,
  news: readonly T[],
  olds: readonly T[],
  label: (item: T) => L,
): Record<string, L> {
  const out: Record<string, L> = {};
  const seen = new Set<string>();
  for (const item of [...news, ...olds]) {
    if (!wanted.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    out[item.id] = label(item);
  }
  return out;
}

function diffLabels(
  oldGuide: Guide,
  newGuide: Guide,
  kinds: Record<LabelKind, KindDiff>,
  effects: ProgressDiff | null,
): DiffLabels {
  const wanted: Record<LabelKind, Set<string>> = {
    sections: listedIds(kinds.sections),
    tasks: listedIds(kinds.tasks),
    categories: listedIds(kinds.categories),
  };
  for (const m of effects?.migrated ?? []) wanted[LABEL_KIND[m.kind]].add(m.from).add(m.to);
  for (const r of [...(effects?.orphaned ?? []), ...(effects?.restored ?? [])]) {
    wanted[LABEL_KIND[r.kind]].add(r.id);
  }
  const item = (x: { title: string; spoiler: boolean }): ItemLabel => ({
    title: x.title,
    spoiler: x.spoiler,
  });
  return {
    sections: labelsFor(
      wanted.sections,
      flatten(newGuide.sections),
      flatten(oldGuide.sections),
      item,
    ),
    tasks: labelsFor(wanted.tasks, newGuide.tasks, oldGuide.tasks, item),
    categories: labelsFor(wanted.categories, newGuide.categories, oldGuide.categories, (c) => ({
      name: c.name,
    })),
  };
}

function leafIds(guide: Guide): Set<string> {
  return new Set(
    flatten(guide.sections)
      .filter((s) => s.children.length === 0)
      .map((s) => s.id),
  );
}

const KIND_ORDER: readonly ProgressKind[] = [
  ProgressKind.Cleared,
  ProgressKind.Pin,
  ProgressKind.Task,
  ProgressKind.Tracked,
];

function sortRefs(refs: ProgressRef[]): ProgressRef[] {
  return refs.sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * What this update does to stored progress. Usable means: a cleared or pin ID is a leaf, a task
 * state ID is a task, a tracked ID is a category. Progress usable in both guides is untouched, and
 * progress unusable in both isn't listed. Migrated progress is not also reported as orphaned.
 */
function progressDiff(
  oldGuide: Guide,
  newGuide: Guide,
  progress: RunProgress,
  sectionRenames: readonly Renamed[],
  taskRenames: readonly Renamed[],
): ProgressDiff {
  const oldLeaves = leafIds(oldGuide);
  const newLeaves = leafIds(newGuide);
  const migrated = progressMoves(sectionRenames, taskRenames, progress, { oldLeaves, newLeaves });
  const moved = new Set(migrated.map((m) => `${m.kind}\0${m.from}`));
  const oldTasks = new Set(oldGuide.tasks.map((t) => t.id));
  const newTasks = new Set(newGuide.tasks.map((t) => t.id));
  const oldCats = new Set(oldGuide.categories.map((c) => c.id));
  const newCats = new Set(newGuide.categories.map((c) => c.id));

  const entries: { ref: ProgressRef; old: Set<string>; next: Set<string> }[] = [
    ...[...progress.cleared].map((id) => ({
      ref: { kind: ProgressKind.Cleared, id },
      old: oldLeaves,
      next: newLeaves,
    })),
    ...(progress.pin === null
      ? []
      : [{ ref: { kind: ProgressKind.Pin, id: progress.pin }, old: oldLeaves, next: newLeaves }]),
    ...[...progress.tasks.keys()].map((id) => ({
      ref: { kind: ProgressKind.Task, id },
      old: oldTasks,
      next: newTasks,
    })),
    ...[...progress.tracked.keys()].map((id) => ({
      ref: { kind: ProgressKind.Tracked, id },
      old: oldCats,
      next: newCats,
    })),
  ];
  const orphaned: ProgressRef[] = [];
  const restored: ProgressRef[] = [];
  for (const { ref, old, next } of entries) {
    const before = old.has(ref.id);
    const after = next.has(ref.id);
    if (before && !after && !moved.has(`${ref.kind}\0${ref.id}`)) orphaned.push(ref);
    if (!before && after) restored.push(ref);
  }
  return { migrated, orphaned: sortRefs(orphaned), restored: sortRefs(restored) };
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
