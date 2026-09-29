# @sweep/server

Express 5 (ESM) API, Drizzle ORM on Postgres 16, Better Auth (session C). Spec §6.

## Commands

- `pnpm --filter @sweep/server dev`: `tsx watch src/index.ts` on `PORT` (3000)
- `pnpm --filter @sweep/server test`: Vitest + supertest against the **real** Postgres from `docker compose up -d postgres`
- `pnpm db:generate` → review the SQL in `packages/server/drizzle/` → commit. `pnpm db:migrate` applies it. The server also applies migrations on start (`src/db/migrate.ts`).

## Layout

- `src/app.ts`: `createApp({ db, clientDistDir })`. Mounts routers under `/api`, answers unknown `/api/*` with a JSON 404, and when `clientDistDir` is set (the Docker image sets `CLIENT_DIST_DIR`) serves the built client with SPA fallback.
- `src/routes/<resource>.ts`: one router factory per resource, e.g. `healthRouter(db)`.
- `src/guides/core-adapter.ts` and `src/guides/parse-worker.ts`: the only src importers of `@sweep/core/parse`. Every parse runs in a worker thread with a time budget (`PARSE_TIMEOUT_MS`, spec §6.4). `src/http/upload.ts` `uploadParser` allows one parse per user at a time (429). The worker runs as `.ts` from source through Node's type stripping, so it has no relative imports.
- `src/guides/store.ts` `loadCurrentGuide` is a pure read (it runs inside snapshots and run-locked transactions). Routes call `Renormalizer.ensureCurrentModel` / `ensureUserModels` (`src/guides/renormalize.ts`) BEFORE opening that transaction: a stale `model_version` is re-parsed in the worker outside any transaction, one shared parse per version; a source that no longer parses is served as stored and not retried in this process; a timeout or worker failure is served as stored and retried after `RENORMALIZE_RETRY_MS` (60 s). `GET /runs` lists a run whose stats throw with zero stats rather than failing the list.
- `src/db/schema.ts` (Drizzle tables), `src/db/client.ts` (`createDb`), `src/db/migrate.ts`
- `src/env.ts` (`readEnv`: validates `DATABASE_URL`, `PORT`, `SIGNUP_ENABLED`; reads `BETTER_AUTH_*` and `CLIENT_DIST_DIR` as optional), `src/load-env.ts` (loads the repo-root `.env` whatever the cwd)

## Rules

- `.js` extensions on relative imports (`module: nodenext` errors without them).
- Error shape: `{ error: { code, message, issues? } }` (spec §6.2). A run owned by someone else returns **404, never 403** (spec §6.4).
- No database mocks. Each test file gets an isolated schema or database once tables exist (spec §8).
- Logs never contain guide content or file bodies.
- Use `@sweep/core/parse` for uploads. Never parse guides by hand.

## Session C to-dos the scaffold leaves open

- Raise the `express.json()` limit (default 100 kB, set in `src/app.ts`) to fit upload limits (`LIMITS.fileBytes` is 2 MB), and update the 413 test in `test/app.test.ts`, which relies on the default.
- Better Auth tables and config; make `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` required in `readEnv`.
- helmet + strict CSP, rate limits, quotas (spec §6.4, §6.5).
- `create-user` script (`pnpm --filter @sweep/server create-user`, planned; the script doesn't exist yet).
