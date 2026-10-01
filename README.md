# Sweep

A game-agnostic, spoiler-light companion for playing games, whether it's a replay or a first playthrough.

You upload a **guide** file describing a game's sections, tasks and walkthroughs, and Sweep turns it into a private, interactive checklist that answers three questions at a glance:

- What's worth doing here?
- What closes for good if I move on?
- What's left?

Sweep is meant to be glanced at when you enter a new area and then put away, so you're not glued to a full guide. Spoiler control is built in.

> **Status: early development.** The guide parser, validator and engine (`@sweep/core`), the API with accounts (`@sweep/server`) and the client (`@sweep/client`, session D) are in place. The client has every §5 screen, the offline-tolerant retry queue, resume at current, the PWA update prompt, and Playwright e2e at both viewports. See the [delivery plan](docs/superpowers/specs/2026-09-28-sweep-design.md#10-delivery-plan).

## Highlights (v1 goals)

- **A simple guide format** (YAML or Markdown). You can write it by hand, or an LLM can generate it from an existing walkthrough. It handles non-linear games, second chances and mutually exclusive choices.
- **Missable is computed, never labelled.** Authors describe when each task is available, and Sweep works out what's closing.
- **Warnings before you close something off.** Clearing a section shows exactly which open tasks it would close.
- **Guide updates without losing progress.** Fix or regenerate a guide mid-run and review a diff before applying it.
- **Phone first, installable PWA.** It stays usable on a 4:3 landscape handheld too.
- **Private accounts.** Guides are only visible to whoever uploaded them.

## Stack

| Package | What |
|---|---|
| [`packages/core`](packages/core) (`@sweep/core`) | Pure TypeScript: the guide model, parser and validator, the progress engine, and the `sweep` CLI |
| [`packages/server`](packages/server) (`@sweep/server`) | Express 5 API, Drizzle ORM on Postgres 16, Better Auth |
| [`packages/client`](packages/client) (`@sweep/client`) | Angular 22 PWA (standalone components, signals) with Tailwind CSS 4 |

It's a pnpm workspace. Tests use Vitest and Playwright, and the whole app ships as one Docker image.

## Getting started

**Prerequisites:**
- Node 24.21.0 (see `.nvmrc`; at least 24.15).
- pnpm 10.34.6, run through corepack.
- Docker.

```bash
nvm use                    # Node 24.21.0
corepack enable pnpm       # uses the pinned pnpm 10.34.6
cp .env.example .env
pnpm install               # also builds @sweep/core and installs git hooks
docker compose up -d postgres
pnpm dev                   # client on http://localhost:4200, API on :3000
```

To run the full production image instead: `docker compose up -d --build`, then open http://localhost:3000.
Deploying to a server pulls the image CI publishes instead of building: see [docs/deployment.md](docs/deployment.md).

**Showing it to someone.** Set `DEMO_ENABLED=true` and the sign-in page gains a "Try the demo" button. A guest signs in as a shared demo account and gets a few sample playthroughs at different stages, held in server memory for their session only. Nothing a guest does is saved (spec §6.6, ADR 0015).

## Common commands

| Command | What |
|---|---|
| `pnpm dev` | Watch mode for core, server and client together |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm typecheck` | Type-checks every package |
| `pnpm test` | Unit and integration tests (the server tests need Postgres running) |
| `pnpm e2e` | Playwright at phone (390×844) and 4:3 handheld (1024×768) sizes |
| `pnpm build` | Builds all packages |
| `pnpm sweep validate <file>` | Validates a guide file |

[`CLAUDE.md`](CLAUDE.md) has the full list, plus each package's own commands.

## Documentation

- [Design spec](docs/superpowers/specs/2026-09-28-sweep-design.md): the source of truth for behaviour, the guide format, the engine, the UI and the API.
- [Architecture decision records](docs/adr/README.md): settled decisions and the reasons behind them.
- [Guide format](docs/guide-format.md): the authoring reference for writing guides.
- [Example guides](guides/examples/) and [JSON Schema](schema/).

## Development notes

This repo is set up for AI-assisted development with [Claude Code](https://claude.com/claude-code):
- `CLAUDE.md` files hold the instructions for the repo and for each package.
- A Prettier hook formats every file Claude edits.
- There's a `write-sweep-guide` skill for converting walkthroughs into guides.
- The Angular CLI MCP server is configured.

The lefthook pre-commit hook runs formatting, lint and typecheck. CI runs the full pipeline, including end-to-end tests, on every push to `master` and on every pull request.
