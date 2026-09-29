// Structural validation (plan phase 4). Runs the Zod schema over the parsed YAML and turns its
// verdict into Sweep issues with stable codes and exact locations, then checks what the schema
// can't express: section, task and category counts, nesting depth, and long overviews. Issues are
// mapped by the raw value at the issue's path and by which field that path names, never by Zod's
// message text, and each message names the field and the shape it expects.
import type { z } from 'zod';
import type { Issue, IssueSeverity } from '../model/issue.js';
import { ErrorCode, WarningCode, type IssueCode } from './issue-codes.js';
import { issue } from './issues.js';
import { LIMITS } from './limits.js';
import { formatPath, type Locator, type PathSegment, type SourcePosition } from './locate.js';
import { guideSchema, KNOWN_KEYS, SLUG_PATTERN, type RawGuide } from './schema.js';
import type { SourceText } from './text.js';

type ZodIssue = z.core.$ZodIssue;
type Mapping = Record<string, unknown>;

/** Longest slug (spec §3.3). */
const SLUG_MAX_CHARS = 64;
/** Hard limit for an overview (spec §3.3); the schema reports anything longer. */
const OVERVIEW_MAX_CHARS = 500;
/** Above this many characters, or with a line break, an overview gets a warning (spec §3.3). */
const OVERVIEW_WARN_CHARS = 200;
/** Unknown keys within this edit distance of a known key get a "did you mean" suggestion. */
const SUGGEST_DISTANCE = 3;
/** Longest quoted value in a message before it's cut short. */
const QUOTE_CHARS = 40;

const SLUG_SHAPE =
  'a slug (lowercase letters and digits in words joined by single hyphens, starting with a ' +
  'letter, at most 64 characters, like forest-chest)';
/** Slug fields other than `id`, with what each names, for messages. */
const SLUG_ROLES: Readonly<Record<string, string>> = {
  category: 'a category ID',
  exclusive: 'an exclusive-group name',
  from: 'a section ID',
  until: 'a section ID or end',
  home: 'a leaf section ID',
  requires: 'a section ID',
  any: 'a section ID',
  renamed_from: 'a previous ID',
};
/** Plain-text fields where YAML numbers and booleans are kept as written (`game: 1942`). */
const PLAIN_TEXT = {
  guide: ['game', 'title'],
  category: ['name', 'about'],
  section: ['title', 'overview', 'walkthrough'],
  task: ['title', 'how'],
} as const;

function isMapping(value: unknown): value is Mapping {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/** Whether a string at `path` is a slug: an `id`, a slug field, or an entry of an ID list. */
function isSlugPath(path: readonly PathSegment[]): boolean {
  const last = path.at(-1);
  return typeof last === 'number' || last === 'id' || Object.hasOwn(SLUG_ROLES, String(last));
}

/** The value at `path`, or undefined when a segment is absent. */
function valueAt(root: unknown, path: readonly PathSegment[]): unknown {
  let node = root;
  for (const segment of path) {
    if (Array.isArray(node) && typeof segment === 'number') node = node[segment];
    else if (isMapping(node) && typeof segment === 'string' && Object.hasOwn(node, segment)) {
      node = node[segment];
    } else return undefined;
  }
  return node;
}

/** `2000` gives `2,000`, independent of locale. */
function count(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A short description of a YAML value, for "found …" in messages. */
function describe(value: unknown): string {
  if (value === null || value === undefined) return 'an empty value';
  if (typeof value === 'string') {
    if (value.length <= QUOTE_CHARS) return JSON.stringify(value);
    return `${JSON.stringify(`${value.slice(0, QUOTE_CHARS)}…`)} (${count(value.length)} characters)`;
  }
  if (typeof value === 'number') return `the number ${value}`;
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const odd = value.find((entry) => typeof entry !== 'string');
    return odd === undefined ? 'a list' : `a list with ${describe(odd)} in it`;
  }
  return 'a mapping';
}

/** What the field at `path` must be, for messages. */
function expected(path: readonly PathSegment[]): string {
  const last = path.at(-1);
  const parent = path.at(-2);
  if (typeof last === 'number') {
    if (parent === 'sections') return 'a section: a mapping with id, title and overview';
    if (parent === 'tasks') return 'a task: a mapping with id, title, category and windows';
    if (parent === 'windows') return 'a window: a mapping with from, and optionally until and home';
    return `${SLUG_ROLES[String(parent)] ?? 'an ID'}, ${SLUG_SHAPE}`;
  }
  if (parent === 'categories' && path.length === 2) {
    return 'a category: a mapping with name and about';
  }
  switch (last) {
    case 'game':
    case 'title':
    case 'overview':
    case 'name':
    case 'about':
    case 'walkthrough':
    case 'how':
      return 'text';
    case 'spoiler':
    case 'tracked':
      return 'true or false';
    case 'categories':
      return 'a mapping from category ID to category';
    case 'sections':
      return 'a list of sections';
    case 'tasks':
      return 'a list of tasks';
    case 'windows':
      return `a list of 1–${LIMITS.windowsPerTask} windows`;
    case 'requires':
      return 'a list of section IDs, like [a, b], or {any: [a, b]}';
    case 'any':
      return 'a list of section IDs, like [a, b]';
    case 'renamed_from':
      return 'a slug or a list of slugs';
    case 'id':
      return SLUG_SHAPE;
    default:
      return `${SLUG_ROLES[String(last)] ?? 'an ID'}, ${SLUG_SHAPE}`;
  }
}

/** Known keys of the mapping at `path`, for `unknown-key` suggestions. */
function knownKeys(path: readonly PathSegment[]): readonly string[] {
  const parent = path.at(-2);
  if (path.length === 0) return KNOWN_KEYS.guide;
  // Before `requires`: a category may be keyed `requires`.
  if (path.length === 2 && parent === 'categories') return KNOWN_KEYS.category;
  if (path.at(-1) === 'requires') return KNOWN_KEYS.any;
  if (parent === 'windows') return KNOWN_KEYS.window;
  if (parent === 'tasks') return KNOWN_KEYS.task;
  return KNOWN_KEYS.section;
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/**
 * Suggests the closest known key within `SUGGEST_DISTANCE` edits, but only when that is fewer edits
 * than the key has characters (otherwise `foo` or `3` would "suggest" `id`).
 */
function unknownKeyMessage(key: string, known: readonly string[]): string {
  let best: string | undefined;
  let bestDistance = Math.min(SUGGEST_DISTANCE + 1, key.length);
  for (const candidate of known) {
    const distance = levenshtein(key, candidate);
    if (distance < bestDistance) [best, bestDistance] = [candidate, distance];
  }
  const hint = best === undefined ? `known keys: ${known.join(', ')}` : `did you mean \`${best}\`?`;
  return `unknown key \`${key}\` is ignored; ${hint}`;
}

/** Calls `visit` for every section mapping, in route order. Top-level sections are depth 1. */
function eachSection(
  root: unknown,
  visit: (section: Mapping, path: PathSegment[], depth: number) => void,
): void {
  const walk = (list: unknown, path: PathSegment[], depth: number): void => {
    if (!Array.isArray(list)) return;
    list.forEach((section, i) => {
      if (!isMapping(section)) return;
      const sectionPath = [...path, i];
      visit(section, sectionPath, depth);
      walk(section.sections, [...sectionPath, 'sections'], depth + 1);
    });
  };
  walk(valueAt(root, ['sections']), ['sections'], 1);
}

/**
 * Replaces numbers and booleans in plain-text fields with the scalar's source text, so
 * `game: 1942` reads as "1942" and `title: 3.10` keeps its trailing zero. Mutates `root`.
 */
function keepScalarText(root: unknown, locator: Locator): void {
  const keep = (mapping: unknown, keys: readonly string[], path: PathSegment[]): void => {
    if (!isMapping(mapping)) return;
    for (const key of keys) {
      const value = mapping[key];
      if (typeof value !== 'number' && typeof value !== 'boolean') continue;
      const source = locator.sourceOf([...path, key]);
      if (source !== undefined) mapping[key] = source;
    }
  };
  keep(root, PLAIN_TEXT.guide, []);
  const categories = valueAt(root, ['categories']);
  if (isMapping(categories)) {
    for (const [id, category] of Object.entries(categories)) {
      keep(category, PLAIN_TEXT.category, ['categories', id]);
    }
  }
  eachSection(root, (section, path) => keep(section, PLAIN_TEXT.section, path));
  const tasks = valueAt(root, ['tasks']);
  if (Array.isArray(tasks)) tasks.forEach((task, i) => keep(task, PLAIN_TEXT.task, ['tasks', i]));
}

interface Context {
  value: unknown;
  locator: Locator;
  report(
    severity: IssueSeverity,
    code: IssueCode,
    message: string,
    at: SourcePosition,
    path: readonly PathSegment[],
  ): void;
}

/** Reports an error located at the value node of `path`. */
function error(ctx: Context, code: ErrorCode, message: string, path: readonly PathSegment[]): void {
  ctx.report('error', code, message, ctx.locator.value(path), path);
}

function field(path: readonly PathSegment[]): string {
  return `\`${formatPath(path)}\``;
}

function idFormat(ctx: Context, path: readonly PathSegment[]): void {
  const found = describe(valueAt(ctx.value, path));
  error(ctx, ErrorCode.IdFormat, `${field(path)} must be ${SLUG_SHAPE}; found ${found}`, path);
}

/** Fields whose value is a list of IDs, for `quoteHint`. */
const ID_LISTS: ReadonlySet<PathSegment | undefined> = new Set(['requires', 'any', 'renamed_from']);

/**
 * What an ID or reference field at `path` names, or undefined when `path` isn't one: a section or
 * task `id`, a slug field, or an entry of an ID list.
 */
function idRole(path: readonly PathSegment[]): string | undefined {
  const last = path.at(-1);
  const parent = path.at(-2);
  if (typeof last === 'number')
    return ID_LISTS.has(parent) ? SLUG_ROLES[String(parent)] : undefined;
  if (last === 'id') return path.at(-3) === 'tasks' ? 'a task ID' : 'a section ID';
  if (last === 'requires' || last === 'any') return undefined;
  return Object.hasOwn(SLUG_ROLES, String(last)) ? SLUG_ROLES[String(last)] : undefined;
}

/**
 * Ruling R6: YAML reads unquoted `true`, `null` or `~` as a boolean or null, which an ID field
 * can't hold. Reports a `type` error that tells the author to quote it, at each such value at
 * `path` or in the ID list there. Returns whether it reported anything.
 */
function quoteHint(ctx: Context, path: readonly PathSegment[]): boolean {
  const value = valueAt(ctx.value, path);
  let candidates: PathSegment[][] = [[...path]];
  if (Array.isArray(value) && ID_LISTS.has(path.at(-1))) {
    candidates = value.map((_, i) => [...path, i]);
  } else if (path.at(-1) === 'requires' && isMapping(value) && Array.isArray(value.any)) {
    candidates = value.any.map((_, i) => [...path, 'any', i]);
  }
  let reported = false;
  for (const candidate of candidates) {
    const found = valueAt(ctx.value, candidate);
    const role = idRole(candidate);
    if ((found !== null && typeof found !== 'boolean') || role === undefined) continue;
    const last = candidate.at(-1)!;
    const name = typeof last === 'number' ? `${String(candidate.at(-2))}[${last}]` : last;
    const raw = ctx.locator.sourceOf(candidate) ?? String(found);
    let message: string;
    if (raw === '') {
      message = `\`${name}\` is empty; give it ${role}`;
    } else {
      const kind = found === null ? 'null' : 'boolean';
      const quoted = typeof last === 'number' ? `"${raw}"` : `${name}: "${raw}"`;
      message = `\`${name}\` must be a string; YAML read \`${raw}\` as ${kind}, so quote it: ${quoted}`;
    }
    error(ctx, ErrorCode.Type, message, candidate);
    reported = true;
  }
  return reported;
}

/** `type` for a present value; `required` at the mapping that lacks the key for an absent one. */
function typeOrRequired(ctx: Context, path: readonly PathSegment[]): void {
  if (quoteHint(ctx, path)) return;
  const found = valueAt(ctx.value, path);
  if (found !== undefined) {
    const message = `${field(path)} must be ${expected(path)}; found ${describe(found)}`;
    error(ctx, ErrorCode.Type, message, path);
    return;
  }
  const parent = path.slice(0, -1);
  const owner = parent.length === 0 ? 'the guide' : field(parent);
  const message = `${owner} is missing \`${String(path.at(-1))}\`, which must be ${expected(path)}`;
  ctx.report('error', ErrorCode.Required, message, ctx.locator.value(parent), path);
}

function tooSmall(ctx: Context, path: readonly PathSegment[], origin: string): void {
  const last = path.at(-1);
  if (origin === 'string') {
    error(ctx, ErrorCode.Required, `${field(path)} must not be empty`, path);
  } else if (last === 'sections' && path.length === 1) {
    const message = '`sections` is empty; a guide needs at least one leaf section';
    error(ctx, ErrorCode.NoLeaves, message, path);
  } else if (last === 'sections') {
    const message =
      `${field(path)} is an empty list; a group needs at least one section, so remove ` +
      '`sections` to make this section a leaf';
    error(ctx, ErrorCode.Type, message, path);
  } else if (last === 'windows') {
    const message = `${field(path)} must have 1–${LIMITS.windowsPerTask} windows; found 0`;
    error(ctx, ErrorCode.Type, message, path);
  } else {
    typeOrRequired(ctx, path);
  }
}

function tooBig(ctx: Context, path: readonly PathSegment[], origin: string, max: number): void {
  if (origin === 'string' && isSlugPath(path)) {
    idFormat(ctx, path);
    return;
  }
  const last = path.at(-1);
  const found = valueAt(ctx.value, path);
  const size = count(typeof found === 'string' || Array.isArray(found) ? found.length : 0);
  let message: string;
  if (origin === 'string') {
    message = `${field(path)} must be at most ${count(max)} characters; found ${size}`;
  } else if (last === 'windows') {
    message = `${field(path)} must have 1–${max} windows; found ${size}`;
  } else if (last === 'renamed_from') {
    message = `${field(path)} can have at most ${max} entries; found ${size}`;
  } else {
    message = `${field(path)} can list at most ${max} section IDs; found ${size}`;
  }
  error(ctx, ErrorCode.Limit, message, path);
}

/**
 * `requires` and `renamed_from` are unions, and Zod reports a failure of every option. Collapses
 * them to one issue: `id-format` when the value has one of the union's shapes but an entry isn't a
 * slug, otherwise `type`.
 */
function unionFailure(ctx: Context, path: readonly PathSegment[]): void {
  const found = valueAt(ctx.value, path);
  let ids: string[] | undefined;
  if (isStringList(found)) ids = found;
  else if (path.at(-1) === 'renamed_from' && typeof found === 'string') ids = [found];
  else if (isMapping(found) && Object.keys(found).length === 1 && isStringList(found.any)) {
    ids = found.any;
  }
  if (ids?.some((id) => id.length > SLUG_MAX_CHARS || !SLUG_PATTERN.test(id))) {
    idFormat(ctx, path);
  } else {
    typeOrRequired(ctx, path);
  }
}

function mapZodIssue(ctx: Context, zodIssue: ZodIssue): void {
  const path = zodIssue.path.filter((s): s is PathSegment => typeof s !== 'symbol');
  if (path[0] === 'sweep') return; // phase 3 checked it
  switch (zodIssue.code) {
    case 'unrecognized_keys':
      for (const key of zodIssue.keys) {
        const keyPath = [...path, key];
        const message = unknownKeyMessage(key, knownKeys(path));
        ctx.report('warning', WarningCode.UnknownKey, message, ctx.locator.key(keyPath), keyPath);
      }
      return;
    case 'invalid_key':
      // A category key that isn't a slug. `checkCategories` reports it too; `report` dedupes.
      categoryKeyFormat(ctx, String(path.at(-1)));
      return;
    case 'invalid_union':
      unionFailure(ctx, path);
      return;
    case 'invalid_format':
      idFormat(ctx, path);
      return;
    case 'too_small':
      tooSmall(ctx, path, zodIssue.origin);
      return;
    case 'too_big':
      tooBig(ctx, path, zodIssue.origin, Number(zodIssue.maximum));
      return;
    default:
      typeOrRequired(ctx, path);
  }
}

/** Section count, nesting depth and `overview-long`, walking sections in route order. */
function checkSections(ctx: Context): void {
  let sections = 0;
  eachSection(ctx.value, (section, path, depth) => {
    sections += 1;
    if (sections === LIMITS.sections + 1) {
      const message =
        `a guide can have at most ${count(LIMITS.sections)} sections, counting groups; ` +
        `this is section ${count(sections)}`;
      error(ctx, ErrorCode.Limit, message, path);
    }
    if (depth === LIMITS.nestingDepth + 1) {
      const message =
        `sections can nest at most ${LIMITS.nestingDepth} levels deep; ` +
        `this section is at level ${depth}`;
      error(ctx, ErrorCode.Limit, message, [...path, 'id']);
    }
    const overview = section.overview;
    // Zod reports a missing, mistyped or over-limit overview.
    if (typeof overview !== 'string' || overview.length > OVERVIEW_MAX_CHARS) return;
    let problem: string | undefined;
    if (overview.includes('\n')) problem = 'contains a line break';
    else if (overview.length > OVERVIEW_WARN_CHARS) problem = `is ${overview.length} characters`;
    if (problem === undefined) return;
    const overviewPath = [...path, 'overview'];
    const message =
      `${field(overviewPath)} ${problem}; an overview should be one sentence on one line, ` +
      `at most ${OVERVIEW_WARN_CHARS} characters`;
    const at = ctx.locator.value(overviewPath);
    ctx.report('warning', WarningCode.OverviewLong, message, at, overviewPath);
  });
}

function categoryKeyFormat(ctx: Context, key: string): void {
  const path = ['categories', key];
  const message = `category ID \`${key}\` must be ${SLUG_SHAPE}`;
  ctx.report('error', ErrorCode.IdFormat, message, ctx.locator.key(path), path);
}

/**
 * Checks every category key is a slug and every category a mapping, independent of Zod: Zod's
 * record skips a `__proto__` key, which would otherwise reach normalization unchecked.
 */
function checkCategories(ctx: Context): void {
  const categories = valueAt(ctx.value, ['categories']);
  if (!isMapping(categories)) return;
  for (const key of Object.keys(categories)) {
    if (key.length > SLUG_MAX_CHARS || !SLUG_PATTERN.test(key)) categoryKeyFormat(ctx, key);
    if (!isMapping(categories[key])) typeOrRequired(ctx, ['categories', key]);
  }
}

/** Task and category counts (spec §3.7). */
function checkCounts(ctx: Context): void {
  const tasks = valueAt(ctx.value, ['tasks']);
  if (Array.isArray(tasks) && tasks.length > LIMITS.tasks) {
    const message =
      `a guide can have at most ${count(LIMITS.tasks)} tasks; ` +
      `this is task ${count(LIMITS.tasks + 1)}`;
    error(ctx, ErrorCode.Limit, message, ['tasks', LIMITS.tasks]);
  }
  const categories = valueAt(ctx.value, ['categories']);
  const extra = isMapping(categories) ? Object.keys(categories)[LIMITS.categories] : undefined;
  if (extra !== undefined) {
    const path = ['categories', extra];
    const message =
      `a guide can have at most ${LIMITS.categories} categories; ` +
      `this is category ${LIMITS.categories + 1}`;
    ctx.report('error', ErrorCode.Limit, message, ctx.locator.key(path), path);
  }
}

/**
 * Structure phase: validates the parsed YAML against the guide schema (spec §3.3, §3.7) and
 * reports `required`, `type`, `id-format`, `limit` and `no-leaves` errors plus `unknown-key` and
 * `overview-long` warnings. Plain-text scalars are fixed up first (see `keepScalarText`), which
 * mutates `value`. `raw` is set only when there are no errors.
 */
export function checkStructure(
  value: unknown,
  file: SourceText['file'],
  locator: Locator,
): { raw?: RawGuide; issues: Issue[] } {
  const issues: Issue[] = [];
  const reported = new Set<string>();
  const ctx: Context = {
    value,
    locator,
    report(severity, code, message, at, path) {
      // One issue per problem: Zod can flag one value twice (a long slug that also fails the regex).
      const key = `${code} ${formatPath(path)}`;
      if (reported.has(key)) return;
      reported.add(key);
      issues.push(issue(severity, code, message, file, at, path));
    },
  };

  keepScalarText(value, locator);
  const result = guideSchema.safeParse(value);
  if (!result.success) for (const zodIssue of result.error.issues) mapZodIssue(ctx, zodIssue);
  checkCategories(ctx);
  checkSections(ctx);
  checkCounts(ctx);

  if (issues.some((i) => i.severity === 'error')) return { issues };
  return { raw: value as RawGuide, issues };
}
