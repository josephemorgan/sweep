---
status: accepted
date: 2026-09-30
---

# 0015. Demo sign-in: one shared account, per-session in-memory sandboxes

## Context

The operator wants to show Sweep to a friend without creating an account for them. The guest should sign in with one click, see several playthroughs at different stages, and use everything (clear, tick, pin, rename, delete, upload, update a guide) as if the runs were theirs. Nothing the guest does may be written to the database.

A client-only mock was considered. The client has no swappable API layer, its write queue's rules (coalescing, backoff, per-user persistence) are intricate, and uploads can't be parsed in the browser (ADR 0009). A server-side demo reuses the real router's building blocks and leaves the client's auth, guards, interceptor and queue untouched.

## Decision

- `DEMO_ENABLED=true` turns the demo on (default off). The sign-in page shows "Try the demo" only when `GET /api/demo` says it is enabled.
- The server owns ONE demo account (`DEMO_USER_EMAIL` in core). On start-up it ensures the account exists; its password is derived from `BETTER_AUTH_SECRET` with HMAC and never stored in plain text. `POST /api/demo/sign-in` signs the guest in as that account through Better Auth, so the guest has an ordinary session cookie.
- Every `/api/runs*` request from the demo account is served by a **demo router** against an **in-memory sandbox keyed by session id**, seeded from templates (`packages/server/demo/`: guide files plus a `runs.json` of seeded progress, validated at start-up). The demo router mirrors the real router's paths, validation and status codes, uses the same core setters, the same parse worker for uploads and the same `diffGuides` + `migrateProgress` for updates, but persists nothing.
- Sandboxes are bounded: they expire after idle time, are capped in number (least recently touched dropped first), and cap runs, guide versions and uploaded bytes (409 with the usual quota codes). State is lost on server restart.
- The client recognizes a demo session by the user's email and shows a "nothing you do here is saved" banner.

## Consequences

- The database sees only the demo user row and its session rows. Runs, guide versions and progress for the demo account never exist in Postgres, and the DB router is never reached by the demo account.
- Several guests can use the demo at once without seeing each other's changes. Guests share the demo account's rate limits (auth, uploads, API) and its one-parse-at-a-time slot.
- The demo router is a second implementation of the runs API surface. It shares the validation schemas, the id-kind check, the DTO builders, the quota wording and the core engine, so drift is limited to the persistence step. A new endpoint must be added to both routers.
- The demo account can use only `get-session` and `sign-out` of Better Auth's endpoints (the rest answer 404), and its sessions are dropped at server start-up.
- ADR 0012 stands: the demo account's runs are not shared between guests, and no other user's guide is reachable.

Source: spec §6.6.
