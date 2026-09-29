# Sweep guide format (v1)

> **Status: stub.** Session B writes this document from spec §3, in parallel with session A's validator. Until then, **spec §3 is authoritative**: `docs/superpowers/specs/2026-09-28-sweep-design.md`.

Once written, this document and the `@sweep/core` validator are the source of truth for the format (spec §9). A change to either must update the other, and regenerate the JSON Schema (`pnpm schema`, added in session A).

Planned contents: containers (`.yaml`, `.md`), field reference, `requires` forms, windows and `home`, spoilers, prose rules, validation codes, limits, the Lantern Keep walkthrough, and authoring tips for humans and LLMs.

- Validate a guide: `pnpm sweep validate <file>` (session A).
- Examples: `guides/examples/`.
- Converting an existing walkthrough: the `write-sweep-guide` skill (`.claude/skills/write-sweep-guide/`).
