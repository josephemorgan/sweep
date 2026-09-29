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
  for (const error of doc.errors) report(ErrorCode.YamlSyntax, error.message, error.pos[0], null);
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
    const message = `sweep is ${JSON.stringify(root.sweep)}, but Sweep only reads sweep: ${FORMAT_VERSION}`;
    return formatVersion(message, locator.value(['sweep']), ['sweep']);
  }
  return { parsed: { value, locator }, issues };
}

/**
 * Walks every node in document order and reports each duplicate key, custom tag and alias to an
 * undefined anchor. A duplicate key directly under the top-level `categories` map is a duplicate
 * category ID. Returns the aliases in document order.
 */
function checkNodes(doc: Document.Parsed, report: Report): AliasRef[] {
  const aliases: AliasRef[] = [];

  const walk = (node: unknown, path: PathSegment[]): void => {
    if (isPair(node)) {
      // A `key: value` pair written inside a flow sequence.
      walk(node.key, path);
      walk(node.value, path);
      return;
    }
    if (!isNode(node)) return;
    if (node.tag !== undefined && !CORE_TAGS.has(node.tag)) {
      report(
        ErrorCode.YamlSyntax,
        `custom YAML tag ${node.tag} is not allowed`,
        startOf(node),
        path,
      );
    }
    if (isAlias(node)) {
      aliases.push({ node, path });
      if (node.resolve(doc) === undefined) {
        const message = `YAML alias *${node.source} has no anchor &${node.source} before it`;
        report(ErrorCode.YamlSyntax, message, startOf(node), path);
      }
    } else if (isMap(node)) {
      const seen = new Set<string>();
      for (const pair of node.items) {
        walk(pair.key, path);
        const name = isScalar(pair.key) ? String(pair.key.value) : undefined;
        if (name === undefined) {
          walk(pair.value, path);
          continue;
        }
        const keyPath = [...path, name];
        if (seen.has(name)) {
          if (path.length === 1 && path[0] === 'categories') {
            report(
              ErrorCode.IdDuplicate,
              `category ${name} is defined twice`,
              startOf(pair.key),
              keyPath,
            );
          } else {
            report(ErrorCode.YamlSyntax, `duplicate key ${name}`, startOf(pair.key), keyPath);
          }
        }
        seen.add(name);
        walk(pair.value, keyPath);
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, i) => walk(item, [...path, i]));
    }
  };

  walk(doc.contents, []);
  return aliases;
}
