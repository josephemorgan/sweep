---
status: accepted
date: 2026-09-28
---

# 0011. No server-side rendering

## Context

Sweep is a logged-in, client-heavy app whose engine runs in the browser. It's an installable PWA that resumes instantly, with the last opened run cached in `localStorage`. SSR fights the PWA service worker and the `localStorage` resume, and it complicates deployment.

## Decision

No SSR. Revisit only if a public landing page appears (`ng add @angular/ssr`).

## Consequences

- SSR is a v1 non-goal.
- Deployment stays one image: Express serves `/api/*` and the built client, with SPA fallback to `index.html` for non-API GETs.

Source: spec §7 "Why no SSR", §7 Deployment, §1 Goal 7 and Non-goals, §5.7.
