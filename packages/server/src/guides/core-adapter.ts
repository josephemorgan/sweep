// With its worker (parse-worker.ts), the ONLY module that imports @sweep/core/parse (ADR 0009).
// Contract drift from core stays here.
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { Guide, Issue } from '@sweep/core';
import { guideFileName, guideJsonSchema, LIMITS, type ParseResult } from '@sweep/core/parse';
import { GuideContainer } from '../db/schema.js';
import { ApiErrorCode, HttpError } from '../http/errors.js';
import { PARSE_TIMEOUT_MS } from '../limits.js';
import type { ParseJob } from './parse-worker.js';

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
  /** The parse ran over its time budget: `result` is the single `limit` issue. */
  timedOut: boolean;
}

export interface ParseOptions {
  /** Time budget for the whole parse, worker start-up included. Default PARSE_TIMEOUT_MS. */
  timeoutMs?: number | undefined;
  /** Aborting stops the worker, and the call rejects with the signal's reason. */
  signal?: AbortSignal | undefined;
  /** Test hook: the worker entry to run instead of parse-worker. */
  workerUrl?: URL | undefined;
}

const MAX_DISPLAY_NAME = 255;

/**
 * parse-worker next to this file: .ts when running from source (Vitest, tsx), .js when built.
 * Node runs the .ts one with its own type stripping.
 */
const PARSE_WORKER_URL = new URL(
  `./parse-worker${import.meta.url.endsWith('.ts') ? '.ts' : '.js'}`,
  import.meta.url,
);

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

interface WorkerOutcome {
  result: ParseResult;
  timedOut: boolean;
}

function overBudget(timeoutMs: number): ParseResult {
  const issue: Issue = {
    severity: 'error',
    code: 'limit',
    message: `the guide took too long to parse (over ${timeoutMs / 1000} s)`,
    file: null,
    line: null,
    column: null,
    path: null,
  };
  return { issues: [issue] };
}

/** The worker's error without its message, which could quote the guide. */
function workerFailed(err: unknown): Error {
  const kind = err instanceof Error ? err.name : typeof err;
  const code = err instanceof Error && 'code' in err ? `, ${String(err.code)}` : '';
  return new Error(`guide parse worker failed (${kind}${code})`);
}

/**
 * Runs one parse in a fresh worker thread, never on the main thread: the Markdown parser is
 * superlinear on deep nesting, so the size limits don't bound CPU time (spec §6.4). Over budget
 * or on abort, the worker is terminated, and the promise settles only once it has stopped, so a
 * caller's per-user slot covers the thread's whole life.
 */
function parseInWorker(
  job: ParseJob,
  transfer: ArrayBuffer[],
  options: ParseOptions,
): Promise<WorkerOutcome> {
  const timeoutMs = options.timeoutMs ?? PARSE_TIMEOUT_MS;
  const { signal } = options;
  return new Promise<WorkerOutcome>((resolve, reject) => {
    signal?.throwIfAborted();
    const worker = new Worker(options.workerUrl ?? PARSE_WORKER_URL, {
      workerData: job,
      transferList: transfer,
    });
    let settled = false;
    const finish = (settle: () => void, terminate: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (terminate) void worker.terminate().then(settle, settle);
      else settle();
    };
    const timer = setTimeout(() => {
      finish(() => resolve({ result: overBudget(timeoutMs), timedOut: true }), true);
    }, timeoutMs);
    const onAbort = (): void => finish(() => reject(signal?.reason), true);
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.once('message', (result: ParseResult) => {
      finish(() => resolve({ result, timedOut: false }), false);
    });
    worker.once('error', (err) => finish(() => reject(workerFailed(err)), true));
    worker.once('exit', (code) => {
      const err = new Error(`guide parse worker exited with code ${code} before replying`);
      finish(() => reject(err), false);
    });
  });
}

/**
 * Parses an upload in a worker (see parseInWorker). Rejects with 422 `bad-extension` when the
 * name isn't .yaml, .yml or .md, with the signal's reason on abort, and with an Error that
 * carries no guide content when the worker fails.
 */
export async function parseUpload(
  file: UploadedFile,
  options: ParseOptions = {},
): Promise<ParsedUpload> {
  const fileName = guideFileName(file.originalname);
  if (fileName === null) {
    throw new HttpError(422, ApiErrorCode.BadExtension, 'Upload a .yaml, .yml or .md guide file.');
  }
  // Core does the UTF-8 and 2 MiB checks on the raw bytes (spec §3.6 encoding / too-large).
  // The worker gets its own copy of the bytes, transferred rather than cloned.
  const bytes = new Uint8Array(file.buffer);
  const job: ParseJob = { fileName, input: bytes };
  const { result, timedOut } = await parseInWorker(job, [bytes.buffer], options);
  return {
    fileName,
    displayName: displayFileName(file.originalname),
    container: fileName === 'guide.md' ? GuideContainer.Md : GuideContainer.Yaml,
    source: file.buffer.toString('utf8'),
    bytes: file.buffer.length,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    result,
    timedOut,
  };
}

/**
 * Re-parses a stored source in a worker (re-normalization when MODEL_VERSION changes). Over
 * budget, the result is the single `limit` issue. Rejects like parseUpload otherwise.
 */
export async function reparse(
  source: string,
  fileName: GuideFileName,
  options: ParseOptions = {},
): Promise<ParseResult> {
  return (await parseInWorker({ fileName, input: source }, [], options)).result;
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
