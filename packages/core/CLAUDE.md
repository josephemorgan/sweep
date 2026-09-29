# @sweep/core

Pure TypeScript: guide model, parser and validator (`@sweep/core/parse`), engine, diff, and the `sweep` CLI. Spec §3, §4, §4.12.

## Commands

- `pnpm --filter @sweep/core test`: Vitest (`test/**/*.test.ts`)
- `pnpm --filter @sweep/core typecheck`: purity check (`tsconfig.lib.json`, no Node or DOM types) + full check
- `pnpm --filter @sweep/core build` (= root `pnpm build:core`), and `dev` for watch mode
- `pnpm --filter @sweep/core schema` (root `pnpm schema`): regenerate `schema/`
- `pnpm sweep validate <file> [--json]` (root script). Relative paths resolve from the directory you run it in.

## Rules

- **Strict TDD.** Every §3.6 rule and §4 definition gets a failing test first. Fixtures go in `test/fixtures/` (spec §8: `tiny-linear`, `botw-style`, `ff6-style`, `lantern-keep`, plus one invalid fixture per error code asserting code, line and column). Fixtures are `.prettierignore`d, so byte-exact line numbers are safe.
- **Purity.** Only `src/cli/` may use `node:*`, `process` or `console`. Everything else takes data in and returns data out. The parser works on a virtual file map (`Record<path, string>`).
  - `tsconfig.lib.json` has no DOM or Node types, so `TextEncoder`, `URL` and `structuredClone` are untyped. For byte lengths (`LIMITS.fileBytes`), compute the UTF-8 length by hand or add a minimal ambient declaration under `src/`. Never add DOM or Node types.
- **Entry points.** The main entry (`src/index.ts`) must stay browser-safe and small; the client bundles it. Parser, YAML, Markdown and schema libraries are imported only under `src/parse/` and exported from `@sweep/core/parse`.
- Allowed runtime deps: pure libraries only (`yaml`, a CommonMark parser, Zod 4). Add them with `pnpm --filter @sweep/core add …`.
- Consumers import `dist/`, so rebuild after changes (`pnpm build:core`).

## Layout

- Parse phases, in order (`src/parse/`, orchestrated by `index.ts`): `text.ts` (size, decode), `container.ts` (md front matter), `yaml.ts` (syntax, `format-version`), `structure.ts` + `schema.ts` (Zod), `references.ts` (ids, references), `normalize.ts`, `graph.ts` (lineage, cycles), `windows.ts`, `container.ts` again for the md body split, `prose.ts` (warnings). Codes live in `issue-codes.ts`.
- Engine (`src/engine/`): `structure`, `derive`, `cards`, `clear-impact`, `metrics`, `summary`.
- Diff (`src/diff/`): `diff-guides`, `progress-moves`, `progress-kind`, `migrate-progress`.
- Fixtures: `test/fixtures/valid/` and `test/fixtures/invalid/`. `test/parse/invalid-fixtures.test.ts` holds the table: every new error code needs a `CASES` row, every warning a `WARNING_CASES` row.
- `pnpm schema` regenerates `schema/`; CI fails on drift.
- The main entry must stay browser-safe; `test/entry-size.test.ts` guards it.
