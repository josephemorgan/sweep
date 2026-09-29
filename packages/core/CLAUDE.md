# @sweep/core

Pure TypeScript: guide model, parser and validator (`@sweep/core/parse`), engine, diff, and the `sweep` CLI. Spec §3, §4, §4.12.

## Commands

- `pnpm --filter @sweep/core test`: Vitest (`test/**/*.test.ts`)
- `pnpm --filter @sweep/core typecheck`: purity check (`tsconfig.lib.json`, no Node or DOM types) + full check
- `pnpm --filter @sweep/core build` (= root `pnpm build:core`), and `dev` for watch mode
- `pnpm sweep validate <file> [--json]` (root script): stub until session A. Relative paths resolve from the repo root, so run it there or pass an absolute path.

## Rules

- **Strict TDD.** Every §3.6 rule and §4 definition gets a failing test first. Fixtures go in `test/fixtures/` (spec §8: `tiny-linear`, `botw-style`, `ff6-style`, `lantern-keep`, plus one invalid fixture per error code asserting code, line and column). Fixtures are `.prettierignore`d, so byte-exact line numbers are safe.
- **Purity.** Only `src/cli/` may use `node:*`, `process` or `console`. Everything else takes data in and returns data out. The parser works on a virtual file map (`Record<path, string>`).
  - `tsconfig.lib.json` has no DOM or Node types, so `TextEncoder`, `URL` and `structuredClone` are untyped. For byte lengths (`LIMITS.fileBytes`), compute the UTF-8 length by hand or add a minimal ambient declaration under `src/`. Never add DOM or Node types.
- **Entry points.** The main entry (`src/index.ts`) must stay browser-safe and small; the client bundles it. Parser, YAML, Markdown and schema libraries are imported only under `src/parse/` and exported from `@sweep/core/parse`.
- Allowed runtime deps: pure libraries only (`yaml`, a CommonMark parser, Zod 4). Add them with `pnpm --filter @sweep/core add …`.
- Consumers import `dist/`, so rebuild after changes (`pnpm build:core`).

## Scaffold stubs to replace in session A

- `parseGuide` returns a single `not-implemented` error. Once the real parser lands, delete `NOT_IMPLEMENTED` from `src/parse/issue-codes.ts` (the constant and its member of the `IssueCode` union), its import and re-export in `src/parse/index.ts`, and the stub test `test/parse-stub.test.ts`.
- `sweep validate` prints "not implemented yet" and exits 1. Implement per spec §9: `file:line:col severity code message`, `--json`, exit codes 0/1/2. Resolve file arguments against `process.env.INIT_CWD ?? process.cwd()`, because `pnpm sweep` runs from the repo root, then drop the run-from-root caveat in the root and core CLAUDE.md.
- `Issue` (`src/model/issue.ts`) uses `null` for missing locations. Refine it if the validator needs to.
- Add `deriveRun`, `clearImpact`, `diffGuides`, `migrateProgress` and the API DTO types to the main entry (spec §4.12). Bump `MODEL_VERSION` whenever `Guide`'s shape changes.
