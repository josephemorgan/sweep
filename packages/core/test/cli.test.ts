import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { USAGE, run, type CliIo } from '../src/cli/run.js';

const VALID = readFileSync(new URL('./fixtures/valid/tiny-linear.yaml', import.meta.url), 'utf8');
const WARNING = VALID.replace(
  'sections:',
  '  cards:\n    name: Cards\n    about: Unused.\nsections:',
);
const INVALID = VALID.replace('from: forest', 'from: nowhere');

interface Captured {
  code: number;
  out: string[];
  err: string[];
  reads: string[];
}

function capture(argv: string[], files: Record<string, string | Uint8Array> = {}): Captured {
  const out: string[] = [];
  const err: string[] = [];
  const reads: string[] = [];
  const io: CliIo = {
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
    readFile: (p) => {
      reads.push(p);
      const f = files[p];
      if (f === undefined) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
      return typeof f === 'string' ? new TextEncoder().encode(f) : f;
    },
    cwd: '/work',
  };
  return { code: run(argv, io), out, err, reads };
}

describe('sweep validate', () => {
  it('exits 0 for a valid guide', () => {
    const r = capture(['validate', 'g.yaml'], { '/work/g.yaml': VALID });
    expect(r.code).toBe(0);
    expect(r.out.at(-1)).toBe('0 errors, 0 warnings');
  });

  it('prints a warning line and still exits 0', () => {
    const r = capture(['validate', 'g.yaml'], { '/work/g.yaml': WARNING });
    expect(r.code).toBe(0);
    expect(r.out.some((l) => /^g\.yaml:\d+:\d+ warning unused-category /.test(l))).toBe(true);
    expect(r.out.at(-1)).toBe('0 errors, 1 warning');
  });

  it('exits 1 for errors and prints the argument as given', () => {
    const r = capture(['validate', 'sub/g.yaml'], { '/work/sub/g.yaml': INVALID });
    expect(r.code).toBe(1);
    expect(r.out.some((l) => /^sub\/g\.yaml:\d+:\d+ error unknown-section /.test(l))).toBe(true);
    expect(r.out.at(-1)).toBe('1 error, 0 warnings');
  });

  it('prints location-less issues without line and column', () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1).fill(32);
    const r = capture(['validate', 'big.yaml'], { '/work/big.yaml': big });
    expect(r.code).toBe(1);
    expect(r.out.some((l) => l.startsWith('big.yaml error too-large '))).toBe(true);
  });

  it.each([[['validate', 'sub/g.yaml', '--json']], [['validate', '--json', 'sub/g.yaml']]])(
    '--json prints the result object for %j',
    (argv) => {
      const r = capture(argv, { '/work/sub/g.yaml': INVALID });
      expect(r.code).toBe(1);
      expect(r.err).toEqual([]);
      expect(r.out).toHaveLength(1);
      const json = JSON.parse(r.out[0] as string);
      expect(json.file).toBe('sub/g.yaml');
      expect(json.errors).toBe(1);
      expect(json.warnings).toBe(0);
      expect(json.issues.length).toBeGreaterThan(0);
      for (const i of json.issues) expect(i.file).toBe('sub/g.yaml');
    },
  );

  it('--json exits 0 for a valid guide', () => {
    const r = capture(['validate', 'g.yaml', '--json'], { '/work/g.yaml': VALID });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out[0] as string)).toMatchObject({ errors: 0, warnings: 0, issues: [] });
  });

  it('--json replaces file on location-less issues', () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1).fill(32);
    const r = capture(['validate', 'big.yaml', '--json'], { '/work/big.yaml': big });
    expect(JSON.parse(r.out[0] as string).issues[0].file).toBe('big.yaml');
  });

  it('resolves relative paths against cwd', () => {
    const r = capture(['validate', 'sub/g.yaml'], { '/work/sub/g.yaml': VALID });
    expect(r.reads).toEqual(['/work/sub/g.yaml']);
  });

  it.each([
    [[]],
    [['validate']],
    [['validate', 'a.yaml', 'b.yaml']],
    [['validate', 'a.yaml', '--yaml']],
    [['lint']],
  ])('usage error for %j exits 2 and prints usage', (argv) => {
    const r = capture(argv);
    expect(r.code).toBe(2);
    expect(r.err).toContain(USAGE);
    expect(r.out).toEqual([]);
  });

  it('rejects stdin', () => {
    const r = capture(['validate', '-']);
    expect(r.code).toBe(2);
    expect(r.err.join('\n')).toContain('stdin');
  });

  it('rejects an unsupported extension', () => {
    const r = capture(['validate', 'notes.txt']);
    expect(r.code).toBe(2);
    expect(r.err.join('\n')).toContain('expected a .yaml, .yml or .md file');
  });

  it('exits 2 naming the file when it cannot be read', () => {
    const r = capture(['validate', 'missing.yaml']);
    expect(r.code).toBe(2);
    expect(r.err.join('\n')).toContain('missing.yaml');
    expect(r.out).toEqual([]);
  });

  it.each([[['--help']], [['-h']], [['validate', '--help']], [['validate', 'x.yaml', '-h']]])(
    '%j prints usage to stdout and exits 0',
    (argv) => {
      const r = capture(argv);
      expect(r.code).toBe(0);
      expect(r.out).toContain(USAGE);
    },
  );
});
