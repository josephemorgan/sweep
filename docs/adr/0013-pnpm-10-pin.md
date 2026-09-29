---
status: accepted
date: 2026-09-28
---

# 0013. Pin pnpm 10.34.6

## Context

`packages/client` was generated with pnpm 12.6.0 (`packageManager: pnpm@12.6.0`). The scaffold started on Node 24.1.0, whose corepack (0.32.0) can't run pnpm 12: it expects a `bin/pnpm.cjs` entry that the pnpm 12 package doesn't have. Corepack before 0.34.5 (bundled with Node before 24.12) fails the same way. Corepack 0.34.5 and later run pnpm 12, and that covers every Node in the `engines` range (≥ 24.15, corepack 0.34.6; the pinned 24.21.0 has 0.36.0). CI (`pnpm/action-setup`) and the Docker build don't use corepack.

## Decision

Pin `"packageManager": "pnpm@10.34.6"` (the latest 10.x) in the root `package.json`, with `engines.pnpm` `>=10.34.6 <11`. The workspace has one root lockfile. The Docker image installs the same version with `npm install -g pnpm@10.34.6`. pnpm 10 runs under every corepack involved, and changing pnpm majors mid-scaffold (lockfile, build-script allowlist, `deploy --legacy`) was out of scope.

## Consequences

- pnpm 10 blocks dependency build scripts unless they're listed in `pnpm-workspace.yaml` `onlyBuiltDependencies`. The list currently holds `lefthook` and four native build deps: `@parcel/watcher`, `lmdb` and `msgpackr-extract` (from the Angular toolchain) and `esbuild` (used by the Angular toolchain, tsx, drizzle-kit and Vite).
- `pnpm deploy` needs `--legacy`, because workspace packages aren't injected. Turning on `injectWorkspacePackages` would stop core rebuilds reaching consumers in dev.
- Moving to pnpm 12 is no longer blocked by corepack within the `engines` range (Node ≥ 24.15). Consider it in its own session. Node 25+ doesn't bundle corepack at all.

Source: scaffold plan `docs/superpowers/plans/2026-09-28-scaffold.md`.
