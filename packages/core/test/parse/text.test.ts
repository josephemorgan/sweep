import { describe, expect, it } from 'vitest';
import { splitFrontMatter } from '../../src/parse/container.js';
import { issue, sortIssues } from '../../src/parse/issues.js';
import { formatPath } from '../../src/parse/locate.js';
import { readSource } from '../../src/parse/text.js';

const MIB2 = 2 * 1024 * 1024;

describe('formatPath', () => {
  it('formats YAML paths', () => {
    expect(formatPath([])).toBe('');
    expect(formatPath(['sweep'])).toBe('sweep');
    expect(formatPath(['tasks', 3, 'windows', 0, 'home'])).toBe('tasks[3].windows[0].home');
    expect(formatPath(['categories', 'loot', 'name'])).toBe('categories.loot.name');
  });
});

describe('issue and sortIssues', () => {
  it('builds an issue with a formatted path and a location', () => {
    expect(issue('error', 'type', 'm', 'guide.yaml', { line: 2, column: 3 }, ['a', 0])).toEqual({
      severity: 'error',
      code: 'type',
      message: 'm',
      file: 'guide.yaml',
      line: 2,
      column: 3,
      path: 'a[0]',
    });
    expect(issue('error', 'too-large', 'm', null, null, null)).toMatchObject({
      file: null,
      line: null,
      column: null,
      path: null,
    });
  });

  it('sorts by line then column, stably, treating null as 0', () => {
    const a = issue('error', 'type', 'a', 'f', { line: 2, column: 1 }, null);
    const b = issue('error', 'type', 'b', 'f', { line: 1, column: 5 }, null);
    const c = issue('error', 'type', 'c', 'f', { line: 1, column: 5 }, null);
    const d = issue('error', 'type', 'd', 'f', null, null);
    expect(sortIssues([a, b, c, d]).map((i) => i.message)).toEqual(['d', 'b', 'c', 'a']);
  });
});

describe('readSource: root file', () => {
  it('needs exactly one root file', () => {
    for (const files of <Record<string, string>[]>[
      {},
      { 'guide.yaml': 'a', 'guide.md': 'b' },
      { 'notes.txt': 'x' },
    ]) {
      const { source, issues } = readSource(files);
      expect(source).toBeUndefined();
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        severity: 'error',
        code: 'no-root-file',
        file: null,
        line: null,
        column: null,
      });
    }
  });

  it('counts only the root files', () => {
    const { source, issues } = readSource({ 'guide.yaml': 'a', README: 'b' });
    expect(issues).toEqual([]);
    expect(source).toEqual({ file: 'guide.yaml', text: 'a' });
  });
});

describe('readSource: size', () => {
  it('rejects bytes over 2 MiB', () => {
    const { issues } = readSource({ 'guide.yaml': new Uint8Array(MIB2 + 1).fill(0x61) });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'too-large', file: 'guide.yaml', line: null });
  });

  it('measures strings in UTF-8 bytes', () => {
    const { issues } = readSource({ 'guide.yaml': 'é'.repeat(1_048_577) });
    expect(issues[0]?.code).toBe('too-large');
  });

  it('accepts exactly 2 MiB', () => {
    expect(readSource({ 'guide.yaml': new Uint8Array(MIB2).fill(0x61) }).issues).toEqual([]);
    expect(readSource({ 'guide.yaml': 'é'.repeat(1_048_576) }).issues).toEqual([]);
  });
});

describe('readSource: encoding', () => {
  it('locates the first invalid byte', () => {
    const { source, issues } = readSource({
      'guide.yaml': new Uint8Array([0x61, 0x0a, 0x62, 0xff]),
    });
    expect(source).toBeUndefined();
    expect(issues).toEqual([
      expect.objectContaining({ code: 'encoding', file: 'guide.yaml', line: 2, column: 2 }),
    ]);
  });

  it('rejects truncated, overlong and surrogate sequences', () => {
    for (const bytes of [[0xc3], [0xc0, 0x80], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80]]) {
      const { issues } = readSource({ 'guide.yaml': new Uint8Array([0x61, ...bytes]) });
      expect(issues[0]).toMatchObject({ code: 'encoding', line: 1, column: 2 });
    }
  });

  it('treats a lone surrogate in a string as not valid UTF-8', () => {
    const { issues } = readSource({ 'guide.yaml': 'ab\uD800c' });
    expect(issues[0]).toMatchObject({ code: 'encoding', line: 1, column: 3 });
  });

  it('accepts a paired surrogate', () => {
    expect(readSource({ 'guide.yaml': 'a\u{1F600}' }).issues).toEqual([]);
  });
});

describe('readSource: BOM, newlines, Buffer', () => {
  it('strips a BOM from bytes and strings', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('sweep: 1')]);
    expect(readSource({ 'guide.yaml': bytes }).source?.text).toBe('sweep: 1');
    expect(readSource({ 'guide.yaml': '﻿sweep: 1' }).source?.text).toBe('sweep: 1');
  });

  it('normalizes newlines', () => {
    expect(readSource({ 'guide.yaml': 'a\r\nb\rc' }).source?.text).toBe('a\nb\nc');
  });

  it('reads a Node Buffer like a Uint8Array', () => {
    expect(readSource({ 'guide.yaml': Buffer.from('sweep: 1\n') }).source?.text).toBe('sweep: 1\n');
    expect(readSource({ 'guide.yaml': Buffer.from([0xff]) }).issues[0]).toMatchObject({
      code: 'encoding',
      line: 1,
      column: 1,
    });
  });
});

describe('splitFrontMatter', () => {
  it('splits front matter from the body', () => {
    expect(splitFrontMatter('---\nx: 1\n---\n# a\n')).toEqual({
      frontMatter: 'x: 1\n',
      frontMatterLine: 2,
      body: '# a\n',
      bodyLine: 4,
    });
  });

  it('tolerates trailing whitespace on the fence lines', () => {
    expect(splitFrontMatter('--- \nx: 1\n---\t\n')?.frontMatter).toBe('x: 1\n');
  });

  it('allows a closing fence without a final newline', () => {
    expect(splitFrontMatter('---\nx: 1\n---')?.body).toBe('');
  });

  it('allows empty front matter', () => {
    expect(splitFrontMatter('---\n---\n')?.frontMatter).toBe('');
  });

  it('returns null without a leading or closing fence', () => {
    expect(splitFrontMatter('x: 1\n---\n')).toBeNull();
    expect(splitFrontMatter('---\nx: 1\n')).toBeNull();
  });
});
