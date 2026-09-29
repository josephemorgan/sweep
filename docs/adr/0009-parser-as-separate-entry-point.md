---
status: accepted
date: 2026-09-28
---

# 0009. Parser as a separate entry point

## Context

The engine runs in the browser for the UI and in Node for server-side dry runs, diffs and migrations. Parsing and validation need a YAML and Markdown parsing stack that the client doesn't need to bundle. Uploads are validated on the server anyway, during the dry run and again on create or apply.

## Decision

`@sweep/core` exports the model types, `deriveRun`, `clearImpact`, `diffGuides`, `migrateProgress` and the API DTO types; the client and server use it. The parser and validator ship as `@sweep/core/parse` (`parseGuide`, issue codes, limits), used by the server and the `sweep` CLI only. The client imports only `@sweep/core`, and upload validation runs on the server.

## Consequences

- The client bundle stays free of the YAML and Markdown parsing stack.
- The New run and Update guide screens show the report from the server's dry run rather than validating locally.
- The `sweep` bin (`sweep validate <file> [--json]`) serves authors, LLM loops and CI from the same parser.

Source: spec §4.12, §6.3, §4 intro, §5.1, §5.8.
