import {
  isAlias,
  isMap,
  isNode,
  isPair,
  isScalar,
  isSeq,
  LineCounter,
  parseAllDocuments,
  type Alias,
  type Document,
} from 'yaml';
import type { Issue } from '../model/issue.js';
import { ErrorCode } from './issue-codes.js';
import { issue } from './issues.js';
import { LIMITS } from './limits.js';
import { createLocator, type Locator, type PathSegment, type SourcePosition } from './locate.js';
import type { SourceText } from './text.js';

export interface ParsedYaml {
  value: unknown;
  locator: Locator;
}

/** The YAML 1.2 core schema tags (spec §3.5). Any other tag is a custom tag. */
const CORE_TAGS: ReadonlySet<string> = new Set(
  ['str', 'int', 'float', 'bool', 'null', 'seq', 'map'].map((name) => `tag:yaml.org,2002:${name}`),
);

/** The only guide format version this parser reads. */
const FORMAT_VERSION = 1;

type Report = (
  code: ErrorCode,
  message: string,
  offset: number,
  path: PathSegment[] | null,
) => void;

/** The source offset where `node` starts, or 0 when it has none. */
function startOf(node: unknown): number {
  return isNode(node) && node.range ? node.range[0] : 0;
}

interface AliasRef {
  node: Alias;
  path: PathSegment[];
}

/**
 * YAML phase (spec §3.5): parses `text` as a single YAML 1.2 core-schema document, rejects
 * duplicate keys, custom tags and more than `LIMITS.yamlAliasExpansions` alias expansions, then
 * checks `sweep: 1`. Any issue stops the pipeline, so `parsed` is set only when `issues` is empty.
 * `lineOffset` is added to every line (the lines before `.md` front matter).
 */
export function parseYamlSource(
  text: string,
  file: SourceText['file'],
  lineOffset: number,
): { parsed?: ParsedYaml; issues: Issue[] } {
  const lineCounter = new LineCounter();
  const docs = parseAllDocuments(text, {
    version: '1.2',
    schema: 'core',
    uniqueKeys: false,
    prettyErrors: false,
    // Otherwise `yaml` hands its warnings, which quote guide text, to process.emitWarning.
    logLevel: 'error',
    lineCounter,
  });
  const issues: Issue[] = [];
  const at = (offset: number): SourcePosition => {
    const { line, col } = lineCounter.linePos(offset);
    return { line: line + lineOffset, column: col };
  };
  const report: Report = (code, message, offset, path) => {
    issues.push(issue('error', code, message, file, at(offset), path));
  };
  const formatVersion = (
    message: string,
    position: SourcePosition,
    path: PathSegment[] | null,
  ) => ({
    issues: [issue('error', ErrorCode.FormatVersion, message, file, position, path)],
  });

  const [doc, second] = docs;
  if (doc === undefined) {
    return formatVersion('the guide is empty; start it with sweep: 1', at(0), null);
  }
  // One typo can yield several `yaml` errors at the same offset; keep the first of each.
  const errorOffsets = new Set<number>();
  for (const error of doc.errors) {
    if (errorOffsets.has(error.pos[0])) continue;
    errorOffsets.add(error.pos[0]);
    report(ErrorCode.YamlSyntax, error.message, error.pos[0], null);
  }
  if (second !== undefined) {
    const message = 'a guide is a single YAML document; remove the second one';
    report(ErrorCode.YamlSyntax, message, second.range[0], null);
  }
  if (issues.length > 0) return { issues };

  const aliases = checkNodes(doc, report);
  if (issues.length > 0) return { issues };

  let value: unknown;
  try {
    // `yaml` counts the anchored node itself as one use, so allow one more than the limit.
    value = doc.toJS({ maxAliasCount: LIMITS.yamlAliasExpansions + 1 });
  } catch {
    const first = aliases[0];
    const message = `YAML aliases expand to more than ${LIMITS.yamlAliasExpansions} copies`;
    report(ErrorCode.YamlSyntax, message, startOf(first?.node), first?.path ?? null);
    return { issues };
  }

  const locator = createLocator(doc, lineCounter, lineOffset);
  if (!isMap(doc.contents)) {
    return formatVersion(
      'a guide is a YAML mapping that starts with sweep: 1',
      locator.value([]),
      null,
    );
  }
  const root = value as Record<string, unknown>;
  if (!Object.hasOwn(root, 'sweep')) {
    const message = 'sweep is missing; add sweep: 1 as the first line';
    return formatVersion(message, locator.value(['sweep']), ['sweep']);
  }
  if (root.sweep !== FORMAT_VERSION) {
    // Numbers as written: `1e400` reads as Infinity, which JSON would print as null.
    const found =
      typeof root.sweep === 'number'
        ? (locator.sourceOf(['sweep']) ?? String(root.sweep))
        : JSON.stringify(root.sweep);
    const message = `sweep is ${found}, but Sweep only reads sweep: ${FORMAT_VERSION}`;
    return formatVersion(message, locator.value(['sweep']), ['sweep']);
  }
  return { parsed: { value, locator }, issues };
}

/**
 * Walks every node in document order and reports each duplicate key, custom tag, alias to an
 * undefined anchor, and alias to a node that contains it (it would expand forever). A duplicate key
 * directly under the top-level `categories` map is a duplicate category ID. Returns the aliases in
 * document order. The walk keeps an explicit stack, so deep nesting can't overflow the call stack.
 */
function checkNodes(doc: Document.Parsed, report: Report): AliasRef[] {
  const aliases: AliasRef[] = [];
  /** Collections on the path from the root to the node being visited. */
  const ancestors = new Set<unknown>();
  /** Pending steps, run last in, first out. A step may queue more. */
  const work: (() => void)[] = [];
  /** Queues `steps` to run next, in the order given. */
  const next = (steps: (() => void)[]): void => {
    for (let i = steps.length - 1; i >= 0; i -= 1) work.push(steps[i]!);
  };

  const duplicateKey = (name: string, key: unknown, path: PathSegment[]): void => {
    const keyPath = [...path, name];
    if (path.length === 1 && path[0] === 'categories') {
      report(ErrorCode.IdDuplicate, `category ${name} is defined twice`, startOf(key), keyPath);
    } else {
      report(ErrorCode.YamlSyntax, `duplicate key ${name}`, startOf(key), keyPath);
    }
  };

  const visit = (node: unknown, path: PathSegment[]): void => {
    if (isPair(node)) {
      // A `key: value` pair written inside a flow sequence.
      next([() => visit(node.key, path), () => visit(node.value, path)]);
      return;
    }
    if (!isNode(node)) return;
    if (node.tag !== undefined && !CORE_TAGS.has(node.tag)) {
      const message = `custom YAML tag ${node.tag} is not allowed`;
      report(ErrorCode.YamlSyntax, message, startOf(node), path);
    }
    if (isAlias(node)) {
      aliases.push({ node, path });
      const target = node.resolve(doc);
      if (target === undefined) {
        const message = `YAML alias *${node.source} has no anchor &${node.source} before it`;
        report(ErrorCode.YamlSyntax, message, startOf(node), path);
      } else if (ancestors.has(target)) {
        const message = `YAML alias *${node.source} refers to a node that contains it`;
        report(ErrorCode.YamlSyntax, message, startOf(node), path);
      }
      return;
    }
    if (!isMap(node) && !isSeq(node)) return;
    ancestors.add(node);
    const steps: (() => void)[] = [];
    if (isMap(node)) {
      const seen = new Set<string>();
      for (const pair of node.items) {
        steps.push(() => visit(pair.key, path));
        const name = isScalar(pair.key) ? String(pair.key.value) : undefined;
        if (name === undefined) {
          steps.push(() => visit(pair.value, path));
          continue;
        }
        steps.push(() => {
          if (seen.has(name)) duplicateKey(name, pair.key, path);
          seen.add(name);
        });
        steps.push(() => visit(pair.value, [...path, name]));
      }
    } else {
      node.items.forEach((item, i) => steps.push(() => visit(item, [...path, i])));
    }
    next([...steps, () => ancestors.delete(node)]);
  };

  visit(doc.contents, []);
  while (work.length > 0) work.pop()!();
  return aliases;
}
