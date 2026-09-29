import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreRoot = resolve(__dirname, '..');

/**
 * Walk the static import graph of a file, collecting all reachable modules.
 * Returns a set of absolute file paths.
 * Throws if a relative import cannot be resolved.
 */
function walkImportGraph(
  filePath: string,
  visited = new Set<string>(),
  baseDir = coreRoot,
): Set<string> {
  // Remove .js/.ts extensions and resolve to absolute path
  let basePath: string;
  if (filePath.startsWith('/') || filePath.startsWith('C:')) {
    basePath = filePath.replace(/\.(js|ts)$/, '');
  } else {
    basePath = resolve(baseDir, filePath).replace(/\.(js|ts)$/, '');
  }

  // Try both .js and .ts extensions
  let contentPath: string;
  if (existsSync(`${basePath}.js`)) {
    contentPath = `${basePath}.js`;
  } else if (existsSync(`${basePath}.ts`)) {
    contentPath = `${basePath}.ts`;
  } else {
    throw new Error(
      `Cannot resolve import: ${filePath} from ${baseDir} (tried ${basePath}.js and .ts)`,
    );
  }

  // Normalize to forward slashes for consistent path checking
  const normalizedPath = normalize(contentPath).replace(/\\/g, '/');

  if (visited.has(normalizedPath)) {
    return visited;
  }
  visited.add(normalizedPath);

  try {
    const content = readFileSync(contentPath, 'utf-8');

    // Extract import specifiers like: from './path' or import './path'
    // Also handle: from '../path' and import '../path'
    const importPattern = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;
    let match;

    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath !== undefined) {
        // Resolve relative to the directory containing the current file
        const relativeDir = dirname(contentPath);
        const resolvedPath = resolve(relativeDir, importPath);

        // Recursively walk from the resolved path
        walkImportGraph(resolvedPath, visited, baseDir);
      }
    }
  } catch (error) {
    // Re-throw read errors with context
    throw new Error(
      `Failed to read ${contentPath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  return visited;
}

/**
 * Extract all imports from a file content.
 * Returns a set of import specifiers (e.g., 'yaml', './model/guide.js', '../parse/index.js').
 * Excludes type-only imports (import type { ... }).
 */
function extractImports(content: string): Set<string> {
  const imports = new Set<string>();

  // Match import/from statements, excluding type-only imports
  // Negative lookbehind for "import type" is not widely supported, so we use a different approach
  const lines = content.split('\n');
  for (const line of lines) {
    // Skip type-only imports
    if (/^\s*import\s+type\s+/.test(line) || /^\s*import\s+[\w,\s{}*]+\s+from/.test(line)) {
      // Check if this line has "import type" - if so, skip it
      if (/^\s*import\s+type\s+/.test(line)) {
        continue;
      }
    }

    // Extract import specifiers from all import statements (except type-only)
    const importPattern = /(?:from|import)\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importPattern.exec(line)) !== null) {
      const spec = match[1];
      if (spec !== undefined) {
        imports.add(spec);
      }
    }
  }

  return imports;
}

/**
 * Check if an import is forbidden (parser dependencies or parse/ directory).
 * Handles subpaths: zod/v4, yaml/parse, mdast-util-from-markdown/lib/... are forbidden.
 * In the real codebase, forbids src/parse and dist/parse. In tests, forbids any parse/ directory.
 */
function isForbiddenImport(importSpec: string, fileDir: string, packageRoot: string): boolean {
  const forbiddenModules = ['yaml', 'zod', 'mdast-util-from-markdown'];

  // Check external forbidden modules (including subpaths)
  for (const forbiddenModule of forbiddenModules) {
    if (importSpec === forbiddenModule || importSpec.startsWith(forbiddenModule + '/')) {
      return true;
    }
  }

  // Check relative imports pointing to parse/ directory
  if (importSpec.startsWith('.')) {
    const resolvedPath = resolve(fileDir, importSpec);
    const normalizedPath = normalize(resolvedPath).replace(/\\/g, '/');
    const relativeToRoot = normalize(relative(packageRoot, normalizedPath)).replace(/\\/g, '/');

    // Forbid any parse directory or file: src/parse, dist/parse, or just parse/
    // This handles both the real codebase (src/parse, dist/parse) and test cases (parse/)
    if (
      relativeToRoot.startsWith('parse/') ||
      relativeToRoot.startsWith('src/parse') ||
      relativeToRoot.startsWith('dist/parse') ||
      relativeToRoot === 'parse.js' ||
      relativeToRoot === 'parse.ts' ||
      relativeToRoot === 'src/parse.js' ||
      relativeToRoot === 'src/parse.ts' ||
      relativeToRoot === 'dist/parse.js'
    ) {
      return true;
    }
  }

  return false;
}

describe('entry-size: import graph walker', () => {
  it('detects missing relative imports', () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'sweep-test-'));
    try {
      const testFile = resolve(tmpDir, 'test.js');
      writeFileSync(testFile, "import './missing.js';");

      expect(() => walkImportGraph(testFile, new Set(), tmpDir)).toThrow(
        /Cannot resolve import.*missing\.js/,
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it('detects forbidden external subpaths', () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'sweep-test-'));
    try {
      const testFile = resolve(tmpDir, 'test.js');
      writeFileSync(testFile, "import 'zod/v4';");

      const reachable = walkImportGraph(testFile, new Set(), tmpDir);
      const testFileNorm = testFile.replace(/\\/g, '/');
      expect(Array.from(reachable)).toContain(testFileNorm);

      const forbidden: string[] = [];
      for (const filePath of reachable) {
        const content = readFileSync(filePath, 'utf-8');
        const imports = extractImports(content);
        for (const spec of imports) {
          if (isForbiddenImport(spec, dirname(filePath), tmpDir)) {
            forbidden.push(`${filePath}: ${spec}`);
          }
        }
      }

      expect(forbidden).toHaveLength(1);
      expect(forbidden[0]).toContain('zod/v4');
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it('detects forbidden parse paths', () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'sweep-test-'));
    try {
      const parseSubdir = resolve(tmpDir, 'parse');
      mkdirSync(parseSubdir, { recursive: true });
      writeFileSync(resolve(parseSubdir, 'index.js'), 'export const x = 1;');

      const testFile = resolve(tmpDir, 'test.js');
      writeFileSync(testFile, "import './parse/index.js';");

      const reachable = walkImportGraph(testFile, new Set(), tmpDir);

      const forbidden: string[] = [];
      for (const filePath of reachable) {
        const content = readFileSync(filePath, 'utf-8');
        const imports = extractImports(content);
        const fileDir = dirname(filePath);

        for (const spec of imports) {
          if (isForbiddenImport(spec, fileDir, tmpDir)) {
            forbidden.push(`${filePath}: ${spec}`);
          }
        }
      }

      expect(forbidden).toHaveLength(1);
      expect(forbidden[0]).toContain('parse');
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});

describe('entry-size: guard the browser-safe main entry', () => {
  it.skipIf(!existsSync(resolve(coreRoot, 'dist', 'index.js')))(
    'main entry does not import parser dependencies (built; run pnpm build:core)',
    () => {
      const distIndexPath = resolve(coreRoot, 'dist', 'index.js');
      const reachableFiles = walkImportGraph(distIndexPath);

      // Sanity check: should reach engine/derive and have plausible size
      const filePaths = Array.from(reachableFiles);
      const hasDerive = filePaths.some((p) => p.includes('/engine/derive'));
      const hasPlausibleSize = filePaths.length >= 10 && filePaths.length <= 500;

      expect(hasDerive, 'Should reach engine/derive.js').toBe(true);
      expect(
        hasPlausibleSize,
        `Reachable files count (${filePaths.length}) out of plausible range`,
      ).toBe(true);

      const forbiddenImports: string[] = [];

      // Check each reachable file for forbidden imports
      for (const filePath of reachableFiles) {
        const content = readFileSync(filePath, 'utf-8');
        const imports = extractImports(content);
        const fileDir = dirname(filePath);

        for (const importSpec of imports) {
          if (isForbiddenImport(importSpec, fileDir, coreRoot)) {
            forbiddenImports.push(`${filePath}: ${importSpec}`);
          }
        }
      }

      expect(forbiddenImports, 'Should not import parser dependencies').toEqual([]);
    },
  );

  it('source entry does not import parser dependencies (source)', () => {
    const srcIndexPath = resolve(coreRoot, 'src', 'index.ts');

    if (!existsSync(srcIndexPath)) {
      throw new Error('src/index.ts missing');
    }

    const reachableFiles = walkImportGraph(srcIndexPath);

    // Sanity check: should reach engine/derive and have plausible size
    const filePaths = Array.from(reachableFiles);
    const hasDerive = filePaths.some((p) => p.includes('/engine/derive'));
    const hasPlausibleSize = filePaths.length >= 10 && filePaths.length <= 500;

    expect(hasDerive, 'Should reach engine/derive.ts').toBe(true);
    expect(
      hasPlausibleSize,
      `Reachable files count (${filePaths.length}) out of plausible range`,
    ).toBe(true);

    const forbiddenImports: string[] = [];

    // Check each reachable file for forbidden imports
    for (const filePath of reachableFiles) {
      const content = readFileSync(filePath, 'utf-8');
      const imports = extractImports(content);
      const fileDir = dirname(filePath);

      for (const importSpec of imports) {
        if (isForbiddenImport(importSpec, fileDir, coreRoot)) {
          forbiddenImports.push(`${filePath}: ${importSpec}`);
        }
      }
    }

    expect(forbiddenImports, 'Should not import parser dependencies').toEqual([]);
  });
});
