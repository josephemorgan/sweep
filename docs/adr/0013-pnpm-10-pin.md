---
status: accepted
date: 2026-09-28
---

# 0013. Pin pnpm 10.34.6

## Context

`packages/client` was generated with pnpm 12.6.0 (`packageManager: pnpm@12.6.0`). Corepack 0.32–0.36, including the version bundled with Node 24 and the `node:24` Docker images, can't run pnpm 12: the pnpm 12 package lacks the `bin/pnpm.cjs` entry corepack expects. CI (`pnpm/action-setup`), the Docker build and local machines all need one version that every path can run.

## Decision

Pin `"packageManager": "pnpm@10.34.6"` (the latest 10.x) in the root `package.json`, with `engines.pnpm` `>=10.34.6 <11`. The workspace has one root lockfile. The Docker image installs the same version with `npm install -g pnpm@10.34.6`.

## Consequences

- pnpm 10 blocks dependency build scripts unless they're listed in `pnpm-workspace.yaml` `onlyBuiltDependencies`. The list currently holds `lefthook` and four native build deps: `@parcel/watcher`, `lmdb` and `msgpackr-extract` (from the Angular toolchain) and `esbuild` (used by the Angular toolchain, tsx, drizzle-kit and Vite).
- `pnpm deploy` needs `--legacy`, because workspace packages aren't injected. Turning on `injectWorkspacePackages` would stop core rebuilds reaching consumers in dev.
- Revisit when corepack supports pnpm 12, or once corepack is no longer in use (Node 25+ doesn't bundle it).

Source: scaffold plan `docs/superpowers/plans/2026-09-28-scaffold.md`.
