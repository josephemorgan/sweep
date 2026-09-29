import { describe, expect, it } from 'vitest';
import { USAGE, run } from '../src/cli/run.js';

function capture(argv: string[]): { code: number; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(argv, { stdout: (l) => out.push(l), stderr: (l) => err.push(l) });
  return { code, out, err };
}

describe('sweep CLI (scaffold stub, spec §9 exit codes)', () => {
  it('validate <file> reports not implemented and exits 1', () => {
    const r = capture(['validate', 'guide.yaml']);
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('not implemented yet');
  });

  it('accepts --json on validate', () => {
    expect(capture(['validate', 'guide.yaml', '--json']).code).toBe(1);
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
  });

  it('--help prints usage to stdout and exits 0', () => {
    const r = capture(['--help']);
    expect(r.code).toBe(0);
    expect(r.out).toContain(USAGE);
  });
});
