import { resolve } from 'node:path';
import type { Issue } from '../model/issue.js';
import { guideFileName, parseGuide, type GuideFiles, type ParseResult } from '../parse/index.js';
import type { CliIo } from './run.js';

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function formatIssue(i: Issue, file: string): string {
  const where = i.line !== null && i.column !== null ? `${file}:${i.line}:${i.column}` : file;
  return `${where} ${i.severity} ${i.code} ${i.message}`;
}

/**
 * Validates one guide file (spec §9). Returns 0 with no errors, 1 with errors, 2 when it can't be
 * read or the parser fails unexpectedly (never a validation verdict). `parse` is a test seam.
 */
export function validateFile(
  arg: string,
  json: boolean,
  io: CliIo,
  parse: (files: GuideFiles) => ParseResult = parseGuide,
): number {
  if (arg === '-') {
    io.stderr("sweep validate: reading from stdin isn't supported; pass a file path");
    return 2;
  }
  const virtual = guideFileName(arg);
  if (virtual === null) {
    io.stderr(`sweep validate: ${arg}: expected a .yaml, .yml or .md file`);
    return 2;
  }
  let bytes: Uint8Array;
  try {
    bytes = io.readFile(resolve(io.cwd, arg));
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    io.stderr(`sweep validate: cannot read ${arg}: ${reason}`);
    return 2;
  }

  let result: ParseResult;
  try {
    result = parse({ [virtual]: bytes });
  } catch (e) {
    // parseGuide should never throw; if it does, don't let a crash read as "the guide has errors".
    const reason = e instanceof Error ? e.message : String(e);
    io.stderr(`sweep validate: internal error: ${reason}`);
    return 2;
  }
  const issues = result.issues.map((i): Issue => ({ ...i, file: arg }));
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;

  if (json) {
    io.stdout(JSON.stringify({ file: arg, errors, warnings, issues }, null, 2));
  } else {
    for (const i of issues) io.stdout(formatIssue(i, arg));
    io.stdout(`${plural(errors, 'error')}, ${plural(warnings, 'warning')}`);
  }
  return errors > 0 ? 1 : 0;
}
