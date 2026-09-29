# Handoff prompts: sessions A–D

Ready-to-paste kickoff prompts for the four sessions that follow the scaffold (spec §10). Order: **A**, then **B** and **C** in parallel, then **D** (D may start after A). Start each in a fresh Claude Code session at the repo root on an up-to-date `master`.

Every prompt carries the user's General Rules verbatim, as `docs/prompt.md` asks.

---

## Session A: `@sweep/core`

```text
You're starting session A of Sweep: implementing @sweep/core (spec §10, row "A: core").

General Rules (from docs/prompt.md, verbatim):
Use subagent driven development. Take the role of an orchistrator, using opus and sonnet subagents to do mechanical work and report back, to keep your context usage trim.

For any large, self-isolated subtasks, suggest them as separate sessions.

Keep an eye out for good pausing points to run a compact, and let me know whenever they come up.

Pass these instructions along to any sub-sessions that you suggest.

Read first: CLAUDE.md, packages/core/CLAUDE.md, spec docs/superpowers/specs/2026-09-28-sweep-design.md (§2–§4, §8, §9), docs/adr/.

Scope: model, Zod schema + JSON Schema generation (`pnpm schema`, committed to schema/), parser for both containers (.yaml and .md, over a virtual file map), validator (every §3.6 code with line/col), engine (§4: deriveRun, clearImpact), diffGuides, migrateProgress, and `sweep validate` (§9 output format, --json, exit codes 0/1/2). Strict TDD with the §8 fixtures.

Done when: every §8 core test passes, and the Lantern Keep (§3.8) and §3.9 examples validate.

Also in scope (deferred from the scaffold):
- Replace the scaffold stubs listed in packages/core/CLAUDE.md ("Scaffold stubs to replace in session A"), including NOT_IMPLEMENTED and the run-from-root caveat once validate resolves against INIT_CWD.
- Add CI steps: schema drift check (generated vs committed schema/) and example-guide validation (guides/examples/**).
- bin/sweep.js "not built" check matches any error mentioning dist/cli/main.js; compare the resolved URL or use existsSync, and add a test for that branch.
- `until: string | 'end'` collapses to string; document with JSDoc or a branded type.
- The `Window` type shadows the DOM global in client code; consider renaming to TaskWindow before the client uses it.
- `sweep validate --help` exits 2 and `-` is treated as a bad flag; decide and test.
- ESLint boundaries: add tests for core's @angular/*, @sweep/server and @sweep/client bans and their /* subpath variants.
- `build:core` starts with `rm -rf dist` and runs on every pre-commit (typecheck) and `pnpm test`, which briefly breaks a running `pnpm dev`; drop the clean from that path or split out a `clean` script.

Start by writing a plan (superpowers:writing-plans), then execute it subagent-driven.
```

---

## Session B: guide format doc, skill, examples

```text
You're starting session B of Sweep: the guide format doc, the write-sweep-guide skill, and example guides (spec §10, row "B").

General Rules (from docs/prompt.md, verbatim):
Use subagent driven development. Take the role of an orchistrator, using opus and sonnet subagents to do mechanical work and report back, to keep your context usage trim.

For any large, self-isolated subtasks, suggest them as separate sessions.

Keep an eye out for good pausing points to run a compact, and let me know whenever they come up.

Pass these instructions along to any sub-sessions that you suggest.

Read first: CLAUDE.md, spec docs/superpowers/specs/2026-09-28-sweep-design.md (§3 in full, §9), docs/guide-format.md (stub), .claude/skills/write-sweep-guide/SKILL.md (stub), guides/examples/README.md, schema/README.md.

Depends on session A's schema and validator. The doc can be drafted from §3 before A lands; examples and the skill's validate loop need A's `pnpm sweep validate`.

Scope:
- docs/guide-format.md: containers, field reference, requires forms, windows and home, spoilers, prose rules, validation codes, limits, the Lantern Keep walkthrough, authoring tips for humans and LLMs. Once written, it and the validator are co-authoritative (§9).
- guides/examples/: lantern-keep.yaml and lantern-keep.md (must produce the same model), plus the §3.9 samples (BotW, FF8, FF6). Directory is .prettierignore'd; keep exact bytes.
- Expand the write-sweep-guide skill into a full procedure with the validate loop.

Done when: every example passes `pnpm sweep validate`, CI validates them, and the skill has been tried on one real walkthrough excerpt.
```

---

## Session C: `@sweep/server`

```text
You're starting session C of Sweep: implementing @sweep/server (spec §10, row "C: server").

General Rules (from docs/prompt.md, verbatim):
Use subagent driven development. Take the role of an orchistrator, using opus and sonnet subagents to do mechanical work and report back, to keep your context usage trim.

For any large, self-isolated subtasks, suggest them as separate sessions.

Keep an eye out for good pausing points to run a compact, and let me know whenever they come up.

Pass these instructions along to any sub-sessions that you suggest.

Read first: CLAUDE.md, packages/server/CLAUDE.md, spec docs/superpowers/specs/2026-09-28-sweep-design.md (§6, §7, §8 server), docs/adr/ (esp. 0009, 0012).

Scope: Better Auth (email + password, Drizzle adapter), Drizzle schema and migrations (§6.1), runs API (§6.2), upload, dry run, diff and apply (§6.3, via @sweep/core/parse and core's diffGuides/migrateProgress), security (§6.4: helmet + strict CSP, ownership guard returning 404, rate limits), quotas (§6.5), create-user script, and serving /schema/sweep-guide.v1.schema.json. Real Postgres in tests, no DB mocks.

Depends on session A's parse, diff and migrate APIs; auth and DB work can start before A lands.

Done when: every §8 server test passes against real Postgres.

Also in scope (deferred from the scaffold):
- See packages/server/CLAUDE.md "Session C to-dos the scaffold leaves open".
- The health route swallows DB errors without logging; log them (never guide content).
- Missing tests: migrate positive path, ngsw.json no-cache header; the load-env test leaves process.env vars set.
- docker-compose reads the root .env, so BETTER_AUTH_URL is :4200 (the dev proxy origin) inside the app container; decide the right value per environment when wiring auth callbacks.
- The compose BETTER_AUTH_SECRET default is dev-only; make BETTER_AUTH_SECRET and BETTER_AUTH_URL required in readEnv.
- Hashed static assets are served with max-age=0; serve fingerprinted files as immutable (index.html and ngsw files stay no-cache).
- CI never builds the Docker image; add a docker build job with a /api/health smoke test (native auth/crypto deps may need `onlyBuiltDependencies`).
- The error handler has no 500-path test (no route could throw yet); add one with the first real route that can. It also ignores `res.headersSent`; handle that before streaming or long-running routes. The 413 test relies on the 100 kB `express.json()` default, so derive both from one constant when you raise the limit.
- Optional hardening: the runtime image copies files with `--chown=node:node`, so the app user can rewrite its own code; consider root-owned read-only files.
```

---

## Session D: `@sweep/client`

```text
You're starting session D of Sweep: implementing @sweep/client (spec §10, row "D: client").

General Rules (from docs/prompt.md, verbatim):
Use subagent driven development. Take the role of an orchistrator, using opus and sonnet subagents to do mechanical work and report back, to keep your context usage trim.

For any large, self-isolated subtasks, suggest them as separate sessions.

Keep an eye out for good pausing points to run a compact, and let me know whenever they come up.

Pass these instructions along to any sub-sessions that you suggest.

Read first: CLAUDE.md, packages/client/CLAUDE.md, spec docs/superpowers/specs/2026-09-28-sweep-design.md (§4.12, §5, §8 client/e2e), docs/adr/. Use the Angular CLI MCP server (angular-cli in .mcp.json) for Angular APIs.

Scope: every screen in §5: engine wrapped in computed() signals, run view, checking tasks, Clear and pin with the clearImpact warning, bottom bar, layered spoiler reveal, writes with a retry queue, resume and PWA, update-guide diff preview, and the 4:3 landscape pass. Component tests and Playwright flows at both viewports (phone 390×844, handheld-4x3 1024×768).

Depends on session A. Session C's API contract (§6.2) is enough to start, using a fake API service until C lands.

Done when: §8 client and e2e tests pass at both viewports.

Also in scope (deferred from the scaffold):
- CSP (spec §6.4): `script-src 'self'` blocks any inline script or handler, and `base-uri 'self'` keeps `<base href="/">` working. Session C sets `optimization.styles.inlineCritical: false` in the client's production build for this reason; keep it off, and never add inline scripts or event-handler attributes to index.html.
- Manifest icons use a combined "maskable any" purpose; split into separate maskable and any icons.
- app.config.ts import order; the <noscript> left by ng add.
- The e2e webServer reuses a stale local server on :4200 if one is running; make reuse explicit (e.g. only when !CI and documented).
- Consider excluding docs/ and .superpowers/ from the Docker build context (.dockerignore).
- Open question §11.3: confirm the Retroid's real CSS viewport and DPR, and adjust the handheld-4x3 project.
- packages/client/tsconfig.json doesn't reference tsconfig.e2e.json, so editors treat e2e/ and playwright.config.ts as an inferred project; add the reference.
- packages/client/.vscode/tasks.json and launch.json are stale (wait for watch output `ng test --watch=false` never prints; launch points at Karma :9876); fix or remove.
```
