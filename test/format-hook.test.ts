import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const hook = join(repoRoot, '.claude/hooks/format-edited-file.sh');
const UGLY = 'const a={b:"x"}\n';
const PRETTY = "const a = { b: 'x' };\n";

const cleanup: string[] = [];
afterEach(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratchDir(parent: string): string {
  const dir = mkdtempSync(join(parent, '.tmp-hook-'));
  cleanup.push(dir);
  return dir;
}

function runHook(payload: unknown): { status: number | null; stderr: string } {
  const r = spawnSync(hook, [], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: repoRoot },
    encoding: 'utf8',
  });
  return { status: r.status, stderr: r.stderr };
}

function editPayload(filePath: string) {
  return { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: filePath } };
}

describe('PostToolUse Prettier hook', () => {
  it('formats a TS file inside the repo with the repo Prettier config', () => {
    const file = join(scratchDir(repoRoot), 'sample.ts');
    writeFileSync(file, UGLY);
    expect(runHook(editPayload(file)).status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(PRETTY);
  });

  it('handles paths with spaces', () => {
    const dir = join(scratchDir(repoRoot), 'with space');
    mkdirSync(dir);
    const file = join(dir, 'sample file.ts');
    writeFileSync(file, UGLY);
    expect(runHook(editPayload(file)).status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(PRETTY);
  });

  it('leaves files outside the repo alone', () => {
    const file = join(scratchDir(tmpdir()), 'outside.ts');
    writeFileSync(file, UGLY);
    expect(runHook(editPayload(file)).status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(UGLY);
  });

  it('respects .prettierignore (Markdown and dist/ are never formatted)', () => {
    const dir = scratchDir(repoRoot);
    const md = join(dir, 'notes.md');
    writeFileSync(md, '*   item\n');
    mkdirSync(join(dir, 'dist'));
    const built = join(dir, 'dist', 'out.ts');
    writeFileSync(built, UGLY);
    expect(runHook(editPayload(md)).status).toBe(0);
    expect(runHook(editPayload(built)).status).toBe(0);
    expect(readFileSync(md, 'utf8')).toBe('*   item\n');
    expect(readFileSync(built, 'utf8')).toBe(UGLY);
  });

  it('ignores unknown file types', () => {
    const file = join(scratchDir(repoRoot), 'data.xyz');
    writeFileSync(file, UGLY);
    expect(runHook(editPayload(file)).status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(UGLY);
  });

  it('exits 0 on payloads without a file path or with a deleted file', () => {
    expect(runHook({ tool_name: 'Edit', tool_input: {} }).status).toBe(0);
    expect(runHook(editPayload(join(repoRoot, 'does-not-exist.ts'))).status).toBe(0);
  });

  it('reports unparseable files on stderr without blocking (exit 1)', () => {
    const file = join(scratchDir(repoRoot), 'broken.ts');
    writeFileSync(file, 'const = ;\n');
    const r = runHook(editPayload(file));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('prettier could not format');
  });
});
