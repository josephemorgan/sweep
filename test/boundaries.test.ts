import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

/** Lints `code` as if it lived at `filePath` (the file need not exist) and returns rule IDs. */
async function ruleIds(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

describe('package boundaries (spec §7)', () => {
  it('rejects @sweep/core/parse in the client', async () => {
    const ids = await ruleIds(
      'packages/client/src/app/probe.ts',
      "import { parseGuide } from '@sweep/core/parse';\nexport const probe = parseGuide;\n",
    );
    expect(ids).toContain('no-restricted-imports');
  });

  it('allows the @sweep/core main entry in the client', async () => {
    const ids = await ruleIds(
      'packages/client/src/app/probe.ts',
      "import { FORMAT_VERSION } from '@sweep/core';\nexport const probe = FORMAT_VERSION;\n",
    );
    expect(ids).toEqual([]);
  });

  it('rejects server imports in the client', async () => {
    const ids = await ruleIds('packages/client/src/app/probe.ts', "import '@sweep/server';\n");
    expect(ids).toContain('no-restricted-imports');
  });

  it('rejects client and Angular imports in the server', async () => {
    expect(await ruleIds('packages/server/src/probe.ts', "import '@sweep/client';\n")).toContain(
      'no-restricted-imports',
    );
    expect(await ruleIds('packages/server/src/probe.ts', "import '@angular/core';\n")).toContain(
      'no-restricted-imports',
    );
  });

  it.each(['packages/server/src/probe.ts', 'packages/server/src/routes/probe.ts'])(
    'rejects @sweep/core/parse in server code outside the core adapter (%s)',
    async (filePath) => {
      for (const spec of ['@sweep/core/parse', '@sweep/core/parse/x', '@sweep/client']) {
        expect(await ruleIds(filePath, `import '${spec}';\n`), spec).toContain(
          'no-restricted-imports',
        );
      }
    },
  );

  it('allows @sweep/core/parse in the server core adapter and in server tests', async () => {
    const code =
      "import { parseGuide } from '@sweep/core/parse';\nexport const probe = parseGuide;\n";
    expect(await ruleIds('packages/server/src/guides/core-adapter.ts', code)).toEqual([]);
    expect(await ruleIds('packages/server/test/probe.test.ts', code)).toEqual([]);
  });

  it('rejects Node built-ins in core library code, with or without the node: prefix', async () => {
    for (const spec of ['node:fs', 'fs', 'node:path']) {
      const ids = await ruleIds(
        'packages/core/src/probe.ts',
        `import * as m from '${spec}';\nexport const probe = m;\n`,
      );
      expect(ids, spec).toContain('no-restricted-imports');
    }
  });

  it.each([
    '@angular/core',
    '@angular/common/http',
    '@sweep/server',
    '@sweep/server/x',
    '@sweep/client',
    '@sweep/client/x',
  ])('rejects %s in core library code', async (spec) => {
    const ids = await ruleIds('packages/core/src/probe.ts', `import '${spec}';\n`);
    expect(ids).toContain('no-restricted-imports');
  });

  it('rejects process, window and console in core library code', async () => {
    expect(
      await ruleIds('packages/core/src/probe.ts', "export const a = process.env['X'];\n"),
    ).toContain('no-restricted-globals');
    expect(await ruleIds('packages/core/src/probe.ts', 'export const b = window;\n')).toContain(
      'no-restricted-globals',
    );
    expect(await ruleIds('packages/core/src/probe.ts', "console.log('x');\n")).toContain(
      'no-console',
    );
  });

  it('allows Node built-ins and console in core src/cli', async () => {
    const ids = await ruleIds(
      'packages/core/src/cli/probe.ts',
      "import { readFileSync } from 'node:fs';\nconsole.log(readFileSync, process.argv);\n",
    );
    expect(ids).toEqual([]);
  });

  it('allows Node built-ins in core tests', async () => {
    const ids = await ruleIds(
      'packages/core/test/probe.test.ts',
      "import { readFileSync } from 'node:fs';\nexport const probe = readFileSync;\n",
    );
    expect(ids).toEqual([]);
  });
});
