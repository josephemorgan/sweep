import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROOT_ENV_PATH, loadRootEnvFile } from '../src/load-env.js';

describe('loadRootEnvFile', () => {
  const KEYS = ['SWEEP_TEST_A', 'SWEEP_TEST_B'] as const;
  let saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  });
  afterEach(() => {
    for (const key of KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('points at the repo-root .env regardless of cwd', () => {
    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
    expect(ROOT_ENV_PATH).toBe(join(repoRoot, '.env'));
  });

  it('returns false when the file is missing', () => {
    expect(loadRootEnvFile(join(tmpdir(), 'sweep-no-such-dir', '.env'))).toBe(false);
  });

  it('loads variables without overriding ones already set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sweep-env-'));
    try {
      const file = join(dir, '.env');
      writeFileSync(file, 'SWEEP_TEST_A=from-file\nSWEEP_TEST_B=from-file\n');
      process.env['SWEEP_TEST_A'] = 'from-env';
      expect(loadRootEnvFile(file)).toBe(true);
      expect(process.env['SWEEP_TEST_A']).toBe('from-env');
      expect(process.env['SWEEP_TEST_B']).toBe('from-file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
