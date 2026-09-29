---
status: accepted
date: 2026-09-28
---

# 0010. Angular and Express

## Context

The user reviews AI-written code and knows Angular and Express well, which lowers the cost of that review. Conventions from `~/dev/expedition` carry over: pnpm workspaces, Drizzle, ESM, one router per resource, and const-object enums.

## Decision

The client is Angular 22.2 with standalone components and signals, no NgModules, `@angular/pwa` and Tailwind CSS 4. The server is Express 5 in ESM, with Drizzle ORM on Postgres 16.

## Consequences

- Server code uses `.js` import extensions and one router per resource.
- Drizzle migrations are generated and reviewed.
- The core engine is wrapped in `computed()` signals on the client.
- Expedition's conventions apply across the repo.

Source: spec §7 "Why Angular and Express", §6 (stack).
