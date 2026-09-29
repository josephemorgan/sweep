# @sweep/server

Express 5 (ESM) API, Drizzle ORM on Postgres 16, Better Auth (email and password). Spec §6.

## Commands

- `pnpm --filter @sweep/server dev`: `tsx watch src/index.ts` on `PORT` (3000)
- `pnpm --filter @sweep/server test`: Vitest + supertest against the **real** Postgres from `docker compose up -d postgres`. Each test file creates and drops its own `sweep_test_<hex>` database; the `sweep` database is never touched.
- `pnpm --filter @sweep/server create-user --email <email> [--name <name>]`: creates an account. The password is prompted for (hidden, twice), or read from the first stdin line when piped. At least 12 characters. In the image: `docker compose exec app node server/dist/scripts/create-user.js --email <email>`.
- `pnpm db:generate` → review the SQL in `packages/server/drizzle/` → commit. `pnpm db:migrate` applies it. The server (and create-user) also apply migrations on start (`src/db/migrate.ts`).

## Layout

- `src/app.ts`: `createApp({ db, auth, sameOrigin, clientDistDir?, trustProxy?, rateLimits?, quotas?, parseTimeoutMs?, parseWorkerUrl?, renormalize? })`. The last three are test hooks or overrides. Order: helmet → trust proxy → `/api/auth` (limit + Better Auth, before `express.json`) → JSON → same-origin → health → `/schema/…` → session guard → per-user limit → runs router → `/api` 404 → static/SPA → error handler.
- `src/auth.ts`: `createAuth(...)`. Sign-up follows `SIGNUP_ENABLED`; only the create-user script builds a sign-up-enabled instance. Better Auth's own rate limiter is off (ours covers `/api/auth`).
- `src/env.ts` (`readEnv`): validates `DATABASE_URL`, `PORT`, `SIGNUP_ENABLED`, `BETTER_AUTH_SECRET` (32+ characters), `BETTER_AUTH_URL`, `TRUST_PROXY`, `PARSE_TIMEOUT_MS`. Production guard: with `NODE_ENV=production` a non-https `BETTER_AUTH_URL` is refused, except loopback origins (`localhost`, `127.0.0.1`, `[::1]`). `src/load-env.ts` loads the repo-root `.env` whatever the cwd.
- `src/http/`: errors (`HttpError`, `ApiErrorCode`), error handler, typed `res.locals` (`getUser`, `getRun`), session guard, same-origin guard, CSP (`security-headers.ts`), rate limits, zod validation (`parseInput`, `ID_PATTERN`), ownership guard (`loadRun`), multer upload (`upload.ts`).
- Upload routes (`POST /runs`, `POST /runs/:id/guide`) run in this order: query check (`checkQuery`, so a bad query is rejected before any body is read) → upload limiter → multer → parse. Multer errors map to 413 (too large) or 400 (malformed).
- `src/guides/core-adapter.ts` and `src/guides/parse-worker.ts`: the only src importers of `@sweep/core/parse` (ESLint enforces it). `parseGuide` runs in a `worker_thread` with a time budget (`PARSE_TIMEOUT_MS`, default in `src/limits.ts`, spec §6.4). A timeout is reported as a single `limit` issue, in the same response an invalid guide gets. `uploadParser` (`src/http/upload.ts`) allows at most one parse per user at a time; a second concurrent upload gets 429. The worker runs as `.ts` from source through Node's type stripping, so it has no relative imports.
- `src/guides/store.ts`: guide versions. `loadCurrentGuide` is a pure read (it runs inside snapshots and run-locked transactions).
- `src/guides/renormalize.ts`: when `MODEL_VERSION` changes, stale models are re-parsed in the worker BEFORE any transaction opens (routes call `ensureCurrentModel` / `ensureUserModels` first), one shared parse per version. A source that deterministically no longer parses is remembered in-process and served as stored; a timeout or worker crash is served as stored and retried after `RENORMALIZE_RETRY_MS` (60 s). `GET /runs` lists a run whose stats throw with zero stats rather than failing the list.
- `src/runs/`: progress store (`writeProgressChanges`, `mutateProgress` with a run row lock), summary stats, quotas (advisory lock per user), create and update flows, DTO builders.
- `src/routes/`: `health.ts`, `runs.ts` (the one runs router), `schema.ts`.
- `src/limits.ts`: `JSON_BODY_LIMIT_BYTES` (100 kB; uploads are multipart, so JSON stays small), `PARSE_TIMEOUT_MS`, `RENORMALIZE_RETRY_MS`, `RATE_LIMITS`, `QUOTAS`.
- `src/scripts/create-user.ts`: the create-user CLI.

## Rules

- `.js` extensions on relative imports (`module: nodenext` errors without them).
- Never run `docker compose up/down` from a worktree. The shared dev Postgres is the container `sweep-postgres-1`; a second one would fight for :5432.
- Error shape: `{ error: { code, message, issues? } }` (spec §6.2). Throw `HttpError`; never build error bodies by hand.
- A run owned by someone else, or a malformed run ID, is **404, never 403** (`loadRun`).
- Every body, param and query goes through `parseInput` with a zod schema (400 `bad-request`). Write targets must exist with the right kind in the current guide version (422 `unknown-id`).
- Every progress write runs in a transaction that row-locks the run (`mutateProgress`), bumps `updated_at`, and writes only the difference.
- No database mocks. Tests use `test/helpers/context.ts` (`createTestContext`, `signedInAgent`) and `test/helpers/seed.ts`.
- Logs never contain guide content, file bodies, request bodies, SQL or query params (`describeError` strips Drizzle's params).
- `BETTER_AUTH_URL` is the browser origin: `http://localhost:4200` in dev (ng serve proxy), `SWEEP_APP_URL` (default `http://localhost:3000`) in compose, the public https origin in production.

## Follow-ups for session D (client)

- A second concurrent upload by the same user gets 429 with a message saying only one guide is checked at a time. The client should show it and let the user retry.
- A parse that runs out of time comes back as a single `limit` issue in the normal invalid-guide response (dry run 200 with issues, create/apply 422). No special case is needed.
- `requireSession` doesn't forward Better Auth's sliding-session `Set-Cookie`, so a session ends 7 days after sign-in unless the client calls `/api/auth/get-session` (which refreshes it). The client should call it on launch and resume, or a later server change forwards the header.
