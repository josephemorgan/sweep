import type { Issue } from '../model/issue.js';
import { ErrorCode, WarningCode } from './issue-codes.js';
import { issue } from './issues.js';
import { formatPath, type Locator, type PathSegment } from './locate.js';
import type { RawGuide } from './schema.js';
import type { SourceText } from './text.js';

type RawSection = RawGuide['sections'][number];

/** The reserved ID that `until` may name and no section or task may use (spec §3.3). */
const END = 'end';

interface Element {
  id: string;
  path: PathSegment[];
  renamedFrom: string | string[] | undefined;
}

/**
 * Identity and reference phase (spec §3.6): reserved and duplicate IDs, unknown section and
 * category references, empty `any`, single-member exclusive groups, rename conflicts, a missing
 * `categories` map, and unused categories. `blocking` is true when normalization and the later
 * phases can't run (`id-duplicate`, `unknown-section`, `requires-empty-any`).
 */
export function checkReferences(
  raw: RawGuide,
  file: SourceText['file'],
  locator: Locator,
): { issues: Issue[]; blocking: boolean } {
  const issues: Issue[] = [];
  let blocking = false;
  const report = (
    severity: 'error' | 'warning',
    code: ErrorCode | WarningCode,
    message: string,
    at: { line: number; column: number },
    path: PathSegment[],
  ): void => {
    issues.push(issue(severity, code, message, file, at, path));
  };
  const error = (code: ErrorCode, message: string, path: PathSegment[]): void => {
    if (
      code === ErrorCode.IdDuplicate ||
      code === ErrorCode.UnknownSection ||
      code === ErrorCode.RequiresEmptyAny
    ) {
      blocking = true;
    }
    report('error', code, message, locator.value(path), path);
  };

  // Elements in file order: sections depth-first, then tasks.
  const sections: { section: RawSection; path: PathSegment[] }[] = [];
  const walk = (list: RawSection[], base: PathSegment[]): void => {
    for (const [i, section] of list.entries()) {
      const path = [...base, i];
      sections.push({ section, path });
      if (section.sections !== undefined) walk(section.sections, [...path, 'sections']);
    }
  };
  walk(raw.sections, ['sections']);
  const tasks = raw.tasks ?? [];
  const elements: Element[] = [
    ...sections.map((s) => ({
      id: s.section.id,
      path: s.path,
      renamedFrom: s.section.renamed_from,
    })),
    ...tasks.map((t, i) => ({ id: t.id, path: ['tasks', i], renamedFrom: t.renamed_from })),
  ];

  // id-reserved and id-duplicate (first occurrence wins).
  const firstById = new Map<string, PathSegment[]>();
  for (const element of elements) {
    const idPath = [...element.path, 'id'];
    if (element.id === END) {
      error(ErrorCode.IdReserved, `"${END}" is reserved and can't be an ID`, idPath);
    }
    const first = firstById.get(element.id);
    if (first === undefined) {
      firstById.set(element.id, idPath);
    } else {
      const message = `ID "${element.id}" is already used at ${formatPath(first)}`;
      error(ErrorCode.IdDuplicate, message, idPath);
    }
  }

  // Section references. A task ID is unknown too, since only sections can be reached.
  const sectionIds = new Set(sections.map((s) => s.section.id));
  const taskIds = new Set(tasks.map((t) => t.id));
  const checkSection = (id: string, path: PathSegment[]): void => {
    if (sectionIds.has(id)) return;
    const message = taskIds.has(id)
      ? `"${id}" is a task ID, not a section ID`
      : `"${id}" is not a section ID in this guide`;
    error(ErrorCode.UnknownSection, message, path);
  };
  for (const { section, path } of sections) {
    const req = section.requires;
    if (req === undefined) continue;
    const reqPath = [...path, 'requires'];
    const list = Array.isArray(req) ? req : req.any;
    const listPath = Array.isArray(req) ? reqPath : [...reqPath, 'any'];
    if (!Array.isArray(req) && req.any.length === 0) {
      error(ErrorCode.RequiresEmptyAny, '`any` needs at least one section ID', listPath);
    }
    for (const [i, id] of list.entries()) checkSection(id, [...listPath, i]);
  }

  // Task windows and categories.
  const categories = raw.categories ?? {};
  const categoryKeys = Object.keys(categories);
  const used = new Set<string>();
  const exclusiveUses = new Map<string, number[]>();
  for (const [t, task] of tasks.entries()) {
    const path: PathSegment[] = ['tasks', t];
    for (const [w, win] of task.windows.entries()) {
      const wPath = [...path, 'windows', w];
      checkSection(win.from, [...wPath, 'from']);
      if (win.until !== undefined && win.until !== END)
        checkSection(win.until, [...wPath, 'until']);
      if (win.home !== undefined) checkSection(win.home, [...wPath, 'home']);
    }
    used.add(task.category);
    // With no categories at all, the `required` issue below covers every task.
    if (categoryKeys.length > 0 && !categoryKeys.includes(task.category)) {
      const message = `"${task.category}" is not a category in this guide`;
      error(ErrorCode.UnknownCategory, message, [...path, 'category']);
    }
    if (task.exclusive !== undefined) {
      exclusiveUses.set(task.exclusive, [...(exclusiveUses.get(task.exclusive) ?? []), t]);
    }
  }
  for (const [name, users] of exclusiveUses) {
    if (users.length === 1) {
      const message = `exclusive group "${name}" has only one task`;
      error(ErrorCode.ExclusiveSingle, message, ['tasks', users[0]!, 'exclusive']);
    }
  }

  // rename-conflict: against current IDs, the element's own ID, and earlier claims.
  const claimed = new Map<string, PathSegment[]>();
  for (const element of elements) {
    const rename = element.renamedFrom;
    if (rename === undefined) continue;
    const entries = Array.isArray(rename) ? rename : [rename];
    for (const [i, entry] of entries.entries()) {
      const path = [...element.path, 'renamed_from', ...(Array.isArray(rename) ? [i] : [])];
      const claim = claimed.get(entry);
      let message: string | undefined;
      if (entry === element.id) message = `"${entry}" is this element's own ID`;
      else if (firstById.has(entry)) message = `"${entry}" is a current section or task ID`;
      else if (claim !== undefined)
        message = `"${entry}" is already claimed at ${formatPath(claim)}`;
      if (message === undefined) claimed.set(entry, path);
      else error(ErrorCode.RenameConflict, message, path);
    }
  }

  // categories: required when there are tasks, unused warnings otherwise.
  if (tasks.length > 0 && categoryKeys.length === 0) {
    // Located at `tasks`, since `categories` has no node of its own to point at.
    const message = 'a guide with tasks needs `categories`';
    report('error', ErrorCode.Required, message, locator.value(['tasks']), ['categories']);
  }
  for (const key of categoryKeys) {
    if (used.has(key)) continue;
    const path = ['categories', key];
    const message = `category "${key}" has no tasks`;
    report('warning', WarningCode.UnusedCategory, message, locator.key(path), path);
  }

  return { issues, blocking };
}
