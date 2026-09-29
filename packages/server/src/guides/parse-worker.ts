// Worker thread entry for guide parsing (spec §6.4). core-adapter.ts spawns one per parse with a
// ParseJob as workerData, and this posts back one ParseResult. With core-adapter.ts, the only
// src file that imports @sweep/core/parse.
//
// No relative imports: under Vitest and `tsx`, this file runs as TypeScript through Node's own
// type stripping, which doesn't map `./x.js` to `./x.ts`. Type-only imports must say `type`.
import { parentPort, workerData } from 'node:worker_threads';
import type { Issue } from '@sweep/core';
import { parseGuide, type ParseResult } from '@sweep/core/parse';

export interface ParseJob {
  /** Virtual root file name: guide.yaml, guide.yml or guide.md. */
  fileName: string;
  /** The uploaded bytes (core checks UTF-8 and size), or a stored source being re-parsed. */
  input: Uint8Array | string;
}

function hasErrors(result: ParseResult): boolean {
  return result.issues.some((issue) => issue.severity === 'error');
}

/** Postgres text and jsonb can't hold U+0000, and jsonb refuses unpaired surrogates. */
function storable(text: string): boolean {
  return !text.includes('\u0000') && text.isWellFormed();
}

/**
 * The `id` of the innermost section, task or category holding an unstorable string ('' for the
 * guide's own fields), or null when every string is storable.
 */
function unstorableOwner(value: unknown, owner = ''): string | null {
  if (typeof value === 'string') return storable(value) ? null : owner;
  if (typeof value !== 'object' || value === null) return null;
  const id = 'id' in value && typeof value.id === 'string' ? value.id : owner;
  for (const child of Object.values(value)) {
    const found = unstorableOwner(child, id);
    if (found !== null) return found;
  }
  return null;
}

/** 1-based line and column (UTF-16 units) of `index`, counting lines as core does. */
function positionOf(text: string, index: number): { line: number; column: number } {
  const lines = text.slice(text.charCodeAt(0) === 0xfeff ? 1 : 0, index).split(/\r\n?|\n/);
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function encodingError(message: string, file: string, at: Partial<Issue> = {}): Issue {
  return {
    severity: 'error',
    code: 'encoding',
    message,
    file,
    line: null,
    column: null,
    path: null,
    ...at,
  };
}

/**
 * Core accepts U+0000 (CommonMark and YAML comments let it through, and YAML escapes such as
 * "\0" or "\ud800" produce it or an unpaired surrogate in the model), but Postgres can't store
 * either. Refuse them as an `encoding` error, so the upload is a 422 with issues, not a 500.
 * Runs only on otherwise valid guides: anything with errors is refused anyway.
 */
function checkStorable(result: ParseResult, text: string, file: string): ParseResult {
  if (hasErrors(result)) return result;
  let issue: Issue | undefined;
  const nul = text.indexOf('\u0000');
  if (nul >= 0) {
    const message = 'the file contains a NUL character (U+0000), which guides may not contain';
    issue = encodingError(message, file, positionOf(text, nul));
  } else if (result.guide) {
    const owner = unstorableOwner(result.guide);
    if (owner !== null) {
      const where = owner === '' ? "the guide's own fields" : `"${owner}"`;
      const message = `a string in ${where} contains a NUL character or an unpaired surrogate (from a YAML escape), which guides may not contain`;
      issue = encodingError(message, file);
    }
  }
  if (!issue) return result;
  const issues = [...result.issues, issue].sort(
    (a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0),
  );
  return { issues };
}

/** Parses one job: core's checks (UTF-8, size, structure), then the storability check. */
function runParseJob({ fileName, input }: ParseJob): ParseResult {
  const text =
    typeof input === 'string'
      ? input
      : Buffer.from(input.buffer, input.byteOffset, input.byteLength).toString('utf8');
  return checkStorable(parseGuide({ [fileName]: input }), text, fileName);
}

// Spawned as a worker: parse the job and reply once. The thread then exits on its own.
if (parentPort) parentPort.postMessage(runParseJob(workerData as ParseJob));
