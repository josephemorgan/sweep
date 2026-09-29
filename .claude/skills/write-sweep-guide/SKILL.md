---
name: write-sweep-guide
description: Use when converting an existing game walkthrough or guide into a Sweep guide file (.yaml or .md), or when fixing a Sweep guide that fails `sweep validate`.
---

# Write a Sweep guide

> **Status: stub.** The format doc (`docs/guide-format.md`), the validator and the example guides land in sessions A and B. Until then, the format is defined by spec §3 (`docs/superpowers/specs/2026-09-28-sweep-design.md`), and `pnpm sweep validate` only reports "not implemented yet".

## Procedure (to be expanded in session B)

1. Read `docs/guide-format.md` (spec §3 until it exists). Never guess a field.
2. Choose categories that describe *what* a task is (Loot, Cards, Side quests), never whether it's missable. Missable is computed from windows.
3. Build the section tree in route order. Put `requires` only where progression isn't "the previous leaf".
4. Give every task deliberate windows: `from`, `until` (the leaf after which it's really gone) and `home` (the card that should show it).
5. Mark `spoiler: true` on anything that would spoil a first playthrough.
6. Never invent facts that aren't in the source walkthrough. Leave a task out rather than guess.
7. Loop: `pnpm sweep validate <file>` → fix every error → repeat until clean.
