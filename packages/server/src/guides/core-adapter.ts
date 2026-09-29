// The ONLY module that imports @sweep/core/parse (ADR 0009). Contract drift from core stays here.
import { createHash } from 'node:crypto';
import type { Guide, Issue } from '@sweep/core';
import {
  guideFileName,
  guideJsonSchema,
  LIMITS,
  parseGuide,
  type ParseResult,
} from '@sweep/core/parse';
import { GuideContainer } from '../db/schema.js';
import { ApiErrorCode, HttpError } from '../http/errors.js';

export { LIMITS };
export type { ParseResult };

export type GuideFileName = NonNullable<ReturnType<typeof guideFileName>>;

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

export interface ParsedUpload {
  /** Virtual root file name the parser saw (guide.yaml / guide.yml / guide.md). */
  fileName: GuideFileName;
  /** Sanitized original name, stored for display. */
  displayName: string;
  container: GuideContainer;
  /** The file as text. Meaningful only when the result has no `encoding` error. */
  source: string;
  bytes: number;
  sha256: string;
  result: ParseResult;
}

const MAX_DISPLAY_NAME = 255;

/**
 * Basename without control characters, at most 255 code points (Review Focus 1). Only the
 * extension decides whether an upload is accepted; this name is for display.
 */
export function displayFileName(name: string): string {
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
  const clean = [...base.replace(/\p{Cc}/gu, '').trim()].slice(0, MAX_DISPLAY_NAME).join('');
  return clean === '' ? 'guide' : clean;
}

export function containerFileName(container: GuideContainer): GuideFileName {
  return container === GuideContainer.Md ? 'guide.md' : 'guide.yaml';
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

function encodingError(message: string, file: GuideFileName, at: Partial<Issue> = {}): Issue {
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
function checkStorable(result: ParseResult, text: string, file: GuideFileName): ParseResult {
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

/**
 * Parses an upload. Async so the parse can move to a worker with a time budget later without
 * touching callers. Rejects with 422 `bad-extension` when the name isn't .yaml, .yml or .md.
 */
export async function parseUpload(file: UploadedFile): Promise<ParsedUpload> {
  const fileName = guideFileName(file.originalname);
  if (fileName === null) {
    throw new HttpError(422, ApiErrorCode.BadExtension, 'Upload a .yaml, .yml or .md guide file.');
  }
  // Core does the UTF-8 and 2 MiB checks on the raw bytes (spec §3.6 encoding / too-large).
  const source = file.buffer.toString('utf8');
  const result = checkStorable(parseGuide({ [fileName]: file.buffer }), source, fileName);
  return {
    fileName,
    displayName: displayFileName(file.originalname),
    container: fileName === 'guide.md' ? GuideContainer.Md : GuideContainer.Yaml,
    source,
    bytes: file.buffer.length,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    result,
  };
}

/** Re-parses a stored source (re-normalization when MODEL_VERSION changes). Async like parseUpload. */
export async function reparse(source: string, fileName: GuideFileName): Promise<ParseResult> {
  return checkStorable(parseGuide({ [fileName]: source }), source, fileName);
}

export function validGuide(result: ParseResult): Guide | null {
  return result.guide && !hasErrors(result) ? result.guide : null;
}

export function requireValidGuide(result: ParseResult): Guide {
  const guide = validGuide(result);
  if (!guide) {
    throw new HttpError(422, ApiErrorCode.InvalidGuide, 'The guide has errors.', result.issues);
  }
  return guide;
}

let schemaCache: Record<string, unknown> | undefined;

/** JSON Schema for guide files, served at /schema/sweep-guide.v1.schema.json. */
export function guideSchemaJson(): Record<string, unknown> {
  schemaCache ??= guideJsonSchema();
  return schemaCache;
}
