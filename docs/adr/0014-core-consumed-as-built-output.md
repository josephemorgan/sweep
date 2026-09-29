---
status: accepted
date: 2026-09-28
---

# 0014. Consumers import @sweep/core's built output

## Context

Three runtimes consume `@sweep/core`: the Angular build (`@angular/build`, whose Angular compiler requires every `.ts` file it bundles to be part of its own TypeScript compilation), Node at runtime in the server image (which won't type-strip `.ts` files under `node_modules`), and the `sweep` CLI. Pointing `exports` at TypeScript source would need per-tool resolution hacks.

## Decision

Core compiles with `tsc` to `packages/core/dist`. The `exports` for `.` and `./parse` point at `dist/**/*.js` plus `.d.ts`. The root `prepare` script builds core on every `pnpm install`, root `typecheck` and `test` build it first, and `pnpm dev` runs `tsc --watch` for it. The `sweep` bin is a committed JS shim that imports `dist/cli/main.js` and prints a hint if core isn't built.

## Consequences

- A fresh clone works after `pnpm install`, with no manual build step.
- After editing core, the server and client only see the change once core is rebuilt (`pnpm build:core` or a running `pnpm dev`). Stale `dist/` is the main pitfall, and CLAUDE.md warns about it.
- Commands run from a package directory assume core is already built.

Source: scaffold plan `docs/superpowers/plans/2026-09-28-scaffold.md`.
