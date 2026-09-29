---
status: accepted
date: 2026-09-28
---

# 0008. `renamed_from` plus a diff preview

## Context

Fixing a guide mid-run must not wipe progress. LLM regeneration may change every ID, and progress is stored by ID.

## Decision

Sections and tasks carry `renamed_from` (previous IDs). An update shows a `diffGuides` preview (added, edited, removed and renamed per kind, plus migrated, orphaned and restored progress) before it's applied. The diff sets `likelyRegenerated` when most IDs changed, and the UI shows a prominent warning. On apply, `migrateProgress` moves progress through renames inside one transaction. Progress is never deleted on a guide update: orphaned progress is kept and comes back if its ID returns.

## Consequences

- A regeneration that changed every ID is exposed *before* applying.
- Progress tables have no foreign key to guide contents, so orphaned rows persist naturally. Progress is deleted only with its run.
- A `renamed_from` entry that isn't in the old guide is ignored silently, because stale rename history is normal.
- Categories have no `renamed_from` in v1; a renamed category shows as removed plus added.
- Every guide version is kept.

Source: spec §4.11 "Why `renamed_from` and a diff preview", §5.8, §6.3, §6.1.
