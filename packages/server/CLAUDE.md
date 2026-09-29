# @sweep/server

Express 5 (ESM) API, Drizzle ORM on Postgres 16, Better Auth (session C). Spec §6.

## Commands

- `pnpm --filter @sweep/server dev`: `tsx watch src/index.ts` on `PORT` (3000)
- `pnpm --filter @sweep/server test`: Vitest + supertest against the **real** Postgres from `docker compose up -d postgres`
- `pnpm db:generate` → review the SQL in `packages/server/drizzle/` → commit. `pnpm db:migrate` applies it. The server also applies migrations on start (`src/db/migrate.ts`).

## Layout

- `src/app.ts`: `createApp({ db, clientDistDir })`. Mounts routers under `/api`, answers unknown `/api/*` with a JSON 404, and when `clientDistDir` is set (the Docker image sets `CLIENT_DIST_DIR`) serves the built client with SPA fallback.
- `src/routes/<resource>.ts`: one router factory per resource, e.g. `healthRouter(db)`.
- `src/db/schema.ts` (Drizzle tables), `src/db/client.ts` (`createDb`), `src/db/migrate.ts`
- `src/env.ts` (`readEnv`: validates `DATABASE_URL`, `PORT`, `SIGNUP_ENABLED`; reads `BETTER_AUTH_*` and `CLIENT_DIST_DIR` as optional), `src/load-env.ts` (loads the repo-root `.env` whatever the cwd)

## Rules

- `.js` extensions on relative imports (`module: nodenext` errors without them).
- Error shape: `{ error: { code, message, issues? } }` (spec §6.2). A run owned by someone else returns **404, never 403** (spec §6.4).
- No database mocks. Each test file gets an isolated schema or database once tables exist (spec §8).
- Logs never contain guide content or file bodies.
- Use `@sweep/core/parse` for uploads. Never parse guides by hand.

## Session C to-dos the scaffold leaves open

- Better Auth tables and config; make `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` required in `readEnv`.
- helmet + strict CSP, rate limits, quotas (spec §6.4, §6.5). Serve `/schema/sweep-guide.v1.schema.json`.
- `create-user` script (`pnpm --filter @sweep/server create-user`, planned; the script doesn't exist yet).
