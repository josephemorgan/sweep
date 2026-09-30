# Sweep

Sweep is a game-agnostic, spoiler-light companion for playing games. A user uploads a **guide** file (sections, tasks, walkthroughs) and gets a private interactive checklist that shows what's worth doing here, what closes for good if they move on, and what's left.

**Source of truth:** `docs/superpowers/specs/2026-09-28-sweep-design.md`. Settled decisions live in `docs/adr/`. **Don't re-litigate an ADR**: to change a decision, write a new ADR that supersedes it, and get the user's approval first.

## How we work

Use subagent driven development. Take the role of an orchistrator, using opus and sonnet subagents to do mechanical work and report back, to keep your context usage trim.

For any large, self-isolated subtasks, suggest them as separate sessions.

Keep an eye out for good pausing points to run a compact, and let me know whenever they come up.

Pass these instructions along to any sub-sessions that you suggest.

(The four paragraphs above are the user's General Rules from `docs/prompt.md`, verbatim.)

- Core (`@sweep/core`) is **strict TDD**: write the failing test first, run it, then implement (spec §8).
- Server tests hit a **real Postgres** (`docker compose up -d postgres`). No database mocks.
- Before committing: `pnpm lint && pnpm typecheck && pnpm test`. lefthook enforces a subset.
- Conventional commits (`feat(core): …`, `fix(server): …`, `docs: …`, `chore: …`).

## Glossary

Use these terms consistently in code, UI copy, docs and commits.

| Term | Meaning |
|---|---|
| **guide** | The uploaded file, and the normalized model parsed from it. |
| **guide version** | One uploaded revision of a run's guide. All versions are kept. |
| **run** | One user's playthrough, bound to a guide version. Uploading a file creates a run. |
| **section** | A node in the guide's section tree. |
| **group** | A section with child sections. It is rendered as a heading. It is never cleared directly. |
| **leaf** | A section without children. It is rendered as a card. It is the only kind of section a user clears. |
| **route order** | The depth-first order of sections as written in the file. It is used for display and to define "previous" and "next". It is **not** used to decide availability. |
| **requires** | A section's prerequisite: all-of a list, or any-of `{any: [...]}`. |
| **gate** | A section's own `requires`, as satisfied or not. A leaf is unlocked when its gate and every ancestor group's gate are satisfied. |
| **unlocked / reached** | A leaf is *unlocked* when its gates are satisfied. It is *reached* when it is unlocked or cleared. A group is reached when any leaf under it is reached. |
| **window** | One availability range of a task: `{from, until, home}`. It opens when `from` is reached and closes when `until` is cleared. |
| **home** | The leaf whose card shows the task's checkbox for that window. |
| **primary window / 2nd chance** | A task's first window is its primary window. Every later window is a "2nd chance". |
| **clear** | The user marks a leaf finished. This is the only user action that moves the game forward. |
| **current** | The derived "where I am" leaf: a valid pin, otherwise the earliest unlocked, uncleared leaf. |
| **pin** | "I'm here". The user explicitly sets current. |
| **category** | An author-defined kind of task, such as Loot or Cards. It describes *what* a task is, never whether it's missable. |
| **tracked** | A category that is enabled for a run. Untracked categories are hidden everywhere. |
| **exclusive group** | Tasks of which only one can be done. Marking one done makes the others *not-chosen*. |
| **task states** | **open** (a window is open), **upcoming** (no window has opened yet), **done**, **dont-care**, **not-chosen**, **missed** (no window open and none upcoming, or "missed, 2nd chance at X" while a later window is still upcoming). |
| **resolved / unresolved** | Resolved is done, dont-care or not-chosen. Unresolved is open, upcoming or missed. |
| **HERE / NOW / CLOSING / LAST CHANCE** | The bottom-bar metrics (§4.9). |
| **orphaned progress** | Stored progress whose ID isn't in the current guide version. It is kept, and restored if the ID returns. |

Also used in code:

| Term | Meaning |
|---|---|
| **task** | A checklist item. It belongs to one category and has 1–8 windows. |
| **from / until** | A window's opening section (reached) and closing section (cleared). `until` defaults to `from`; `until: end` never closes. |
| **spoiler** | `spoiler: true` blurs a task's title and `how`, or a locked section's title and overview, until revealed (spec §5.6). |

## Commands (run from the repo root)

| Command | What |
|---|---|
| `pnpm install` | Install. Also builds `@sweep/core` (root `prepare`) and installs git hooks (skipped when `CI` is set). |
| `pnpm dev` | core `tsc --watch` + server (`tsx watch`, :3000) + client (`ng serve`, :4200, proxies `/api`) |
| `pnpm lint` / `pnpm format` / `pnpm format:check` | ESLint (whole repo) / Prettier write / check |
| `pnpm typecheck` | Builds core, then type-checks the repo tests and every package (client templates via `ngc`) |
| `pnpm test` | Builds core, then core + server + client unit tests + repo tests (`test/`, alone: `pnpm test:repo`) |
| `pnpm build` | Builds all packages |
| `pnpm e2e` | Playwright, projects `phone` (390×844) and `handheld-4x3` (1024×768), against a fresh `sweep_e2e` database and server on :3100 (see `packages/client/CLAUDE.md`) |
| `pnpm schema` | Regenerate `schema/sweep-guide.v1.schema.json` from core's Zod schema (commit the result) |
| `pnpm validate:examples` | Validate every guide under `guides/examples/` (CI runs it) |
| `pnpm sweep validate <file> [--json]` | Guide validator CLI. Relative paths resolve from the directory you run it in. |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` | drizzle-kit, run in `packages/server` (review generated SQL before committing) |
| `pnpm --filter @sweep/server create-user --email <e>` | Create an account (password prompted, or first stdin line). In the image: `node server/dist/scripts/create-user.js` |
| `pnpm build:core` | Rebuild core's `dist/` (consumers import built output) |
| `docker compose up -d postgres` | Dev database (sweep/sweep@localhost:5432/sweep) |
| `docker compose up -d --build` | Full single-image app on :3000 |

Per package: `pnpm --filter @sweep/<core|server|client> <script>`.

## Packages and boundaries (spec §7)

- `packages/core` → `@sweep/core` (model, engine; browser-safe) and `@sweep/core/parse` (parser, validator; server and CLI only), plus the `sweep` bin.
- `packages/server` → `@sweep/server`: Express 5 API, Drizzle schema and migrations, auth.
- `packages/client` → `@sweep/client`: Angular 22.2 PWA.
- Direction: `client → core` (main entry only, **never `@sweep/core/parse`**) and `server → core`. Client and server never import each other. ESLint enforces this (`test/boundaries.test.ts`).
- **Core purity:** `packages/core/src/**` except `src/cli/` does no I/O and uses no Node, DOM or Angular APIs (`fs`, `process`, `console`, `window` …). ESLint and `tsconfig.lib.json` (`types: []`) enforce it.
- API DTO types live in core, types only.

## Conventions (carried over from ~/dev/expedition)

- ESM everywhere. Server and core use `.js` import extensions (`module: nodenext` enforces it).
- One Express router per resource in `packages/server/src/routes/`.
- Enums are const objects plus a matching type: `export const X = {...} as const; export type X = (typeof X)[keyof typeof X];`
- Kebab-case file names. Explicit types on exported functions.
- Add deps with `pnpm --filter <pkg> add …` (root tools: `pnpm add -Dw …`). Never npm or yarn.

## Known constraints

- **pnpm is pinned to 10.34.6** (`packageManager`). Corepack < 0.34.5 (Node < 24.12) can't run pnpm 12; moving to pnpm 12 is a separate session. See ADR 0013. pnpm 10 blocks dependency build scripts unless they're listed in `pnpm-workspace.yaml` `onlyBuiltDependencies`.
- **Node ≥ 24.15** (Angular CLI 22.2's floor). `.nvmrc` pins 24.21.0 and `.npmrc` has `engine-strict=true`.
- **TypeScript stays on ~6.0** (Angular 22.2 peer range). Don't upgrade to TS 7.
- **Stale core build:** server and client import `packages/core/dist`. After editing core, run `pnpm build:core` (or keep `pnpm dev` running). See ADR 0014.
- `.env` lives at the repo root. Server code loads it regardless of cwd; drizzle-kit loads it through the `db:*` scripts (which run in `packages/server`).
- The compose `BETTER_AUTH_SECRET` default is dev-only. Override it anywhere else.
- **Demo sign-in** (`DEMO_ENABLED=true`, spec §6.6, ADR 0015): a shared demo account whose `/api/runs*` requests go to an in-memory, per-session sandbox in `packages/server/src/demo/`, never to Postgres. A new runs endpoint must be added to both `routes/runs.ts` and `demo/router.ts`. Seeded runs live in `packages/server/demo/`.
- The Prettier PostToolUse hook needs `jq`. Markdown, `guides/` and `packages/core/test/fixtures/` are never auto-formatted (line numbers matter).

## Docs

- Spec: `docs/superpowers/specs/2026-09-28-sweep-design.md`. Plans: `docs/superpowers/plans/`.
- Guide format (authoritative, together with the validator): `docs/guide-format.md`. JSON Schema: `schema/`.
- Decisions: `docs/adr/` (index in `docs/adr/README.md`).
- Per-package notes: `packages/*/CLAUDE.md`.
