---
status: accepted
date: 2026-09-28
---

# 0012. Accounts with private guides

## Context

Sweep starts single-user but is designed for eventual public use. The operator doesn't want responsibility for guide content. Guide sharing, discovery and public guide libraries are v1 non-goals.

## Decision

Sweep is a server app with accounts (Better Auth, email and password). Guides are private to the uploader, with no public or share URLs. Sign-up is off unless `SIGNUP_ENABLED=true`, and the operator creates the first account with a server script.

## Consequences

- Per-user ownership is built in everywhere, so the app can go public later.
- Every `/runs/:runId` route loads the run by `id` and `user_id`. A run the user doesn't own returns `404`, never `403`.
- No endpoint can reach another user's guide or progress.
- Public-launch account flows (email verification, password reset, a sign-up abuse policy) remain open questions while single-user.

Source: spec §1 Goal 6, §6 "Accounts", §6.4 ownership guard, §11.
