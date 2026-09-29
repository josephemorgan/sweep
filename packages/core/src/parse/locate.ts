import {
  isAlias,
  isMap,
  isNode,
  isScalar,
  isSeq,
  type Document,
  type LineCounter,
  type Pair,
} from 'yaml';

/** One step of a YAML path: a mapping key or a sequence index. */
export type PathSegment = string | number;

/** Formats a YAML path, e.g. `['tasks', 3, 'windows', 0, 'home']` gives `tasks[3].windows[0].home`. */
export function formatPath(path: readonly PathSegment[]): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else out += out === '' ? segment : `.${segment}`;
  }
  return out;
}

/** A 1-based line and column (UTF-16 code units) in the guide file. */
export interface SourcePosition {
  line: number;
  column: number;
}

/** Turns a YAML path into a position in the guide file. */
export interface Locator {
  /** Value node of `path`; falls back to the deepest existing ancestor. */
  value(path: readonly PathSegment[]): SourcePosition;
  /** Key node of the last segment (for unknown-key, category keys). */
  key(path: readonly PathSegment[]): SourcePosition;
  /**
   * Source text of the scalar at `path`, following aliases (`1942` for `game: 1942`), or undefined
   * when there's no scalar there. Used to keep numbers and booleans in plain-text fields as written.
   */
  sourceOf(path: readonly PathSegment[]): string | undefined;
}

/**
 * Builds a locator for a parsed document. Positions come from `lineCounter`, and `lineOffset` is
 * added to every line (for `.md` front matter, the lines before the YAML). The walk stops at an
 * alias node rather than following it to its anchor, because the alias is where the value is
 * written at that path.
 */
export function createLocator(
  doc: Document,
  lineCounter: LineCounter,
  lineOffset: number,
): Locator {
  const start: SourcePosition = { line: 1 + lineOffset, column: 1 };

  function at(node: unknown, fallback: SourcePosition): SourcePosition {
    if (!isNode(node) || !node.range) return fallback;
    const { line, col } = lineCounter.linePos(node.range[0]);
    return { line: line + lineOffset, column: col };
  }

  function locate(path: readonly PathSegment[], wantKey: boolean): SourcePosition {
    let node: unknown = doc.contents;
    let position = at(node, start);
    for (const [i, segment] of path.entries()) {
      let pair: Pair | undefined;
      let next: unknown;
      if (isMap(node) && typeof segment === 'string') {
        pair = node.items.find((p) => isScalar(p.key) && String(p.key.value) === segment);
        next = pair?.value;
      } else if (isSeq(node) && typeof segment === 'number') {
        next = node.items[segment];
      }
      if (pair !== undefined && (!isNode(next) || (wantKey && i === path.length - 1))) {
        return at(pair.key, position);
      }
      if (!isNode(next)) return position;
      node = next;
      position = at(node, position);
    }
    return position;
  }

  function nodeAt(path: readonly PathSegment[]): unknown {
    const resolve = (node: unknown): unknown => (isAlias(node) ? node.resolve(doc) : node);
    let node = resolve(doc.contents);
    for (const segment of path) {
      if (isMap(node) && typeof segment === 'string') {
        node = node.items.find((p) => isScalar(p.key) && String(p.key.value) === segment)?.value;
      } else if (isSeq(node) && typeof segment === 'number') {
        node = node.items[segment];
      } else {
        return undefined;
      }
      node = resolve(node);
    }
    return node;
  }

  return {
    value: (path) => locate(path, false),
    key: (path) => locate(path, true),
    sourceOf: (path) => {
      const node = nodeAt(path);
      return isScalar(node) && typeof node.source === 'string' ? node.source : undefined;
    },
  };
}
