import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve, dirname, normalize } from 'node:path';
import { describe, expect, it, type TestContext } from 'vitest';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreRoot = resolve(__dirname, '..');

/**
 * Walk the static import graph of a file, collecting all reachable modules.
 * Returns a set of absolute file paths.
 */
function walkImportGraph(
  filePath: string,
  visited = new Set<string>(),
  baseDir = coreRoot,
): Set<string> {
  const absolutePath = resolve(baseDir, filePath.replace(/\.js$/, ''));

  // Try both .js and .ts extensions
  let contentPath: string;
  if (existsSync(`${absolutePath}.js`)) {
    contentPath = `${absolutePath}.js`;
  } else if (existsSync(`${absolutePath}.ts`)) {
    contentPath = `${absolutePath}.ts`;
  } else {
    // File doesn't exist, skip silently
    return visited;
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
  } catch {
    // If we can't read the file, just continue
  }

  return visited;
}

/**
 * Extract all imports from a file content.
 * Returns a set of import specifiers (e.g., 'yaml', './model/guide.js', '../parse/index.js').
 */
function extractImports(content: string): Set<string> {
  const imports = new Set<string>();

  // Extract all import/from statements
  const importPattern = /(?:from|import)\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = importPattern.exec(content)) !== null) {
    const spec = match[1];
    if (spec !== undefined) {
      imports.add(spec);
    }
  }

  return imports;
}

/**
 * Check if an import is forbidden (parser dependencies or parse/ directory).
 */
function isForbiddenImport(importSpec: string, fileDir: string): boolean {
  // External forbidden modules
  if (importSpec === 'yaml' || importSpec === 'zod' || importSpec === 'mdast-util-from-markdown') {
    return true;
  }

  // Resolve relative imports
  if (importSpec.startsWith('.')) {
    const resolvedPath = resolve(fileDir, importSpec);
    const normalizedPath = normalize(resolvedPath).replace(/\\/g, '/');
    // Check if it's under dist/parse/ or src/parse/
    if (normalizedPath.includes('/parse/')) {
      return true;
    }
  }

  return false;
}

describe('entry-size: guard the browser-safe main entry', () => {
  it('main entry does not import parser dependencies (built)', function (this: TestContext) {
    const distIndexPath = resolve(coreRoot, 'dist', 'index.js');

    if (!existsSync(distIndexPath)) {
      this.skip();
      throw new Error('dist/index.js missing; run pnpm build:core');
    }

    const reachableFiles = walkImportGraph(distIndexPath);
    const forbiddenImports: string[] = [];

    // Check each reachable file for forbidden imports
    for (const filePath of reachableFiles) {
      const content = readFileSync(filePath, 'utf-8');
      const imports = extractImports(content);
      const fileDir = dirname(filePath);

      for (const importSpec of imports) {
        if (isForbiddenImport(importSpec, fileDir)) {
          forbiddenImports.push(`${filePath}: ${importSpec}`);
        }
      }
    }

    expect(forbiddenImports, 'Should not import parser dependencies').toEqual([]);
  });

  it('source entry does not import parser dependencies (source)', () => {
    const srcIndexPath = resolve(coreRoot, 'src', 'index.ts');

    if (!existsSync(srcIndexPath)) {
      throw new Error('src/index.ts missing');
    }

    const reachableFiles = walkImportGraph(srcIndexPath);
    const forbiddenImports: string[] = [];

    // Check each reachable file for forbidden imports
    for (const filePath of reachableFiles) {
      const content = readFileSync(filePath, 'utf-8');
      const imports = extractImports(content);
      const fileDir = dirname(filePath);

      for (const importSpec of imports) {
        if (isForbiddenImport(importSpec, fileDir)) {
          forbiddenImports.push(`${filePath}: ${importSpec}`);
        }
      }
    }

    expect(forbiddenImports, 'Should not import parser dependencies').toEqual([]);
  });
});
