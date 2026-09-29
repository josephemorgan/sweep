import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const realBin = fileURLToPath(new URL('../bin/sweep.js', import.meta.url));
const tmpDirs: string[] = [];

/** Copies the shim into `<tmp>/bin/sweep.js` and optionally writes `<tmp>/dist/cli/main.js`. */
function setup(mainSource?: string): string {
  const tmp = mkdtempSync(join(tmpdir(), 'sweep-bin-'));
  tmpDirs.push(tmp);
  mkdirSync(join(tmp, 'bin'));
  cpSync(realBin, join(tmp, 'bin', 'sweep.js'));
  if (mainSource !== undefined) {
    mkdirSync(join(tmp, 'dist', 'cli'), { recursive: true });
    writeFileSync(join(tmp, 'dist', 'cli', 'main.js'), mainSource);
  }
  return join(tmp, 'bin', 'sweep.js');
}

function run(binPath: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [binPath], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('bin/sweep.js shim', () => {
  it('exits 2 with a build hint when dist is missing', () => {
    const r = run(setup());
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('@sweep/core is not built');
  });

  it('does not swallow errors from inside the built CLI', () => {
    const r = run(setup("import './missing.js';\n"));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ERR_MODULE_NOT_FOUND');
    expect(r.stderr).toContain('missing.js');
  });

  it('runs the built CLI', () => {
    const r = run(setup("console.log('ok');\n"));
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('ok');
  });
});
