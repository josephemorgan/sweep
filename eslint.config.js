// @ts-check
import { builtinModules } from 'node:module';
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const nodeBuiltins = [...new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])];

export default defineConfig([
  globalIgnores([
    '**/dist/',
    '**/coverage/',
    '**/.angular/',
    '.claude/worktrees/**',
    '.superpowers/**',
    'packages/server/drizzle/',
    'packages/client/playwright-report/',
    'packages/client/test-results/',
  ]),

  // All TS/JS: recommended rules, Node globals for tooling and server code.
  {
    files: ['**/*.{ts,js,mjs,cjs}'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // @sweep/core library code is pure (spec §7). Only src/cli may touch Node.
  {
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/cli/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeBuiltins.map((name) => ({
            name,
            message:
              '@sweep/core library code must stay pure: no Node APIs outside src/cli (spec §7).',
          })),
          patterns: [
            {
              group: [
                '@angular/*',
                'express',
                'pg',
                'drizzle-orm',
                '@sweep/server',
                '@sweep/client',
              ],
              message:
                '@sweep/core must not depend on frameworks, I/O libraries or other packages.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'process',
        'Buffer',
        'require',
        '__dirname',
        '__filename',
        'window',
        'document',
        'navigator',
        'localStorage',
        'sessionStorage',
        'fetch',
        'XMLHttpRequest',
      ],
      'no-console': 'error',
    },
  },

  // @sweep/server never imports the client or Angular.
  {
    files: ['packages/server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@sweep/client', '@sweep/client/*', '@angular/*'],
              message: 'Server and client never import each other (spec §7).',
            },
          ],
        },
      ],
    },
  },

  // Only the core adapter and its parse worker import the parser entry point (keeps contract
  // drift in one place).
  {
    files: ['packages/server/src/**/*.ts'],
    ignores: [
      'packages/server/src/guides/core-adapter.ts',
      'packages/server/src/guides/parse-worker.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@sweep/client', '@sweep/client/*', '@angular/*'],
              message: 'Server and client never import each other (spec §7).',
            },
            {
              group: ['@sweep/core/parse', '@sweep/core/parse/*'],
              message: 'Import parser APIs through src/guides/core-adapter.ts.',
            },
          ],
        },
      ],
    },
  },

  // @sweep/client: Angular rules; main core entry only.
  {
    files: ['packages/client/**/*.ts'],
    extends: [angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@sweep/core/parse', '@sweep/core/parse/*'],
              message:
                'The client must not bundle the parser; upload validation runs on the server (spec §4.12).',
            },
            {
              group: ['@sweep/server', '@sweep/server/*'],
              message: 'Server and client never import each other (spec §7).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/client/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },

  // Must stay last: turns off stylistic rules that fight Prettier.
  prettier,
]);
