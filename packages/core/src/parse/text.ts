import type { Issue } from '../model/issue.js';
import { ErrorCode } from './issue-codes.js';
import { issue } from './issues.js';
import { LIMITS } from './limits.js';

export interface SourceText {
  file: 'guide.yaml' | 'guide.yml' | 'guide.md';
  text: string;
}

const ROOT_FILES: readonly SourceText['file'][] = ['guide.yaml', 'guide.yml', 'guide.md'];

/**
 * Text phase (spec §3.2, §3.5): picks the single root file, checks its size, decodes it
 * strictly as UTF-8, strips the BOM and normalizes newlines to `\n`. Rejects U+0000 and unpaired
 * surrogates, which Postgres `text` and `jsonb` can't store.
 */
export function readSource(files: Record<string, string | Uint8Array>): {
  source?: SourceText;
  issues: Issue[];
} {
  const present = ROOT_FILES.filter((name) => Object.hasOwn(files, name));
  const file = present[0];
  if (present.length !== 1 || file === undefined) {
    const message =
      present.length === 0
        ? 'no guide file found: expected one of guide.yaml, guide.yml or guide.md'
        : `expected exactly one guide file, found ${present.join(', ')}`;
    return { issues: [issue('error', ErrorCode.NoRootFile, message, null, null, null)] };
  }
  const raw = files[file] as string | Uint8Array;
  const bytes = typeof raw === 'string' ? utf8Length(raw) : raw.byteLength;
  if (bytes > LIMITS.fileBytes) {
    const message = `the file is ${bytes} bytes; the limit is ${LIMITS.fileBytes} bytes (2 MiB)`;
    return { issues: [issue('error', ErrorCode.TooLarge, message, file, null, null)] };
  }
  let text: string;
  if (typeof raw === 'string') {
    text = normalizeText(raw);
  } else {
    try {
      // The default decoder strips a leading BOM (ignoreBOM: false).
      text = normalizeText(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    } catch {
      const prefix = new TextDecoder('utf-8').decode(raw.subarray(0, firstInvalidByte(raw)));
      return { issues: [encodingIssue(file, normalizeText(prefix), NOT_UTF8)] };
    }
  }
  const bad = firstUnstorable(text);
  if (bad >= 0) {
    const message = text.charCodeAt(bad) === 0 ? HAS_NUL : NOT_UTF8;
    return { issues: [encodingIssue(file, text.slice(0, bad), message)] };
  }
  return { source: { file, text }, issues: [] };
}

const NOT_UTF8 = 'the file is not valid UTF-8';
const HAS_NUL = 'the file contains a NUL character (U+0000)';

/** An `encoding` error just after `prefix`. */
function encodingIssue(file: string, prefix: string, message: string): Issue {
  return issue('error', ErrorCode.Encoding, message, file, positionAt(prefix), null);
}

/** Strips a leading BOM and converts `\r\n` and lone `\r` to `\n`. */
function normalizeText(text: string): string {
  return (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n');
}

/** 1-based line and column (UTF-16 units) just after `prefix`. */
function positionAt(prefix: string): { line: number; column: number } {
  let line = 1;
  for (let i = prefix.indexOf('\n'); i >= 0; i = prefix.indexOf('\n', i + 1)) line++;
  return { line, column: prefix.length - prefix.lastIndexOf('\n') };
}

function isHigh(c: number): boolean {
  return c >= 0xd800 && c <= 0xdbff;
}

function isLow(c: number): boolean {
  return c >= 0xdc00 && c <= 0xdfff;
}

/** UTF-8 byte length of a string. A lone surrogate counts as 3 bytes (U+FFFD). */
function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (isHigh(c) && isLow(text.charCodeAt(i + 1))) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/**
 * Index of the first U+0000 or unpaired surrogate, or -1. Postgres `text` and `jsonb` can store
 * neither, so the YAML phase also uses this on strings that escapes produce.
 */
export function firstUnstorable(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (isHigh(c) && isLow(text.charCodeAt(i + 1))) i++;
    else if (c === 0 || isHigh(c) || isLow(c)) return i;
  }
  return -1;
}

/**
 * Index of the first byte that starts an invalid UTF-8 sequence (truncated, overlong,
 * surrogate, or above U+10FFFF), or the length when the bytes are valid.
 */
function firstInvalidByte(b: Uint8Array): number {
  const cont = (i: number, lo = 0x80, hi = 0xbf): boolean => {
    const c = b[i];
    return c !== undefined && c >= lo && c <= hi;
  };
  let i = 0;
  while (i < b.length) {
    const c = b[i] as number;
    let len = 0;
    if (c < 0x80) len = 1;
    else if (c >= 0xc2 && c <= 0xdf) len = cont(i + 1) ? 2 : 0;
    else if (c === 0xe0) len = cont(i + 1, 0xa0) && cont(i + 2) ? 3 : 0;
    else if (c === 0xed) len = cont(i + 1, 0x80, 0x9f) && cont(i + 2) ? 3 : 0;
    else if (c >= 0xe1 && c <= 0xef) len = cont(i + 1) && cont(i + 2) ? 3 : 0;
    else if (c === 0xf0) len = cont(i + 1, 0x90) && cont(i + 2) && cont(i + 3) ? 4 : 0;
    else if (c >= 0xf1 && c <= 0xf3) len = cont(i + 1) && cont(i + 2) && cont(i + 3) ? 4 : 0;
    else if (c === 0xf4) len = cont(i + 1, 0x80, 0x8f) && cont(i + 2) && cont(i + 3) ? 4 : 0;
    if (len === 0) return i;
    i += len;
  }
  return b.length;
}

/** Maps an upload's name to its virtual root file name (spec §3.2), or null if unsupported. */
export function guideFileName(uploadName: string): 'guide.yaml' | 'guide.yml' | 'guide.md' | null {
  const base = uploadName.slice(uploadName.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot < 0) return null;
  switch (base.slice(dot + 1).toLowerCase()) {
    case 'yaml':
      return 'guide.yaml';
    case 'yml':
      return 'guide.yml';
    case 'md':
      return 'guide.md';
    default:
      return null;
  }
}
