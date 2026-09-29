---
status: accepted
date: 2026-09-28
---

# 0005. Per-window `home`

## Context

In Breath of the Wild, about 700 tasks become doable the moment you leave the Great Plateau. Without a separate placement field, they'd all land in the first open-world card. Windows are invisible metadata that drive computed state; something else has to decide where a task is shown.

## Decision

Each window has a `home`: the leaf whose card shows the task's checkbox for that window. It defaults to the first leaf of `from`, and it must be a leaf within the window. A task's first window is its primary window; later windows are "2nd chance" windows, and a task shows in a later window's `home` card, with a "2nd chance" badge, only while it's unresolved.

## Consequences

- Windows drive computed state and `home` decides placement, so each open-world task appears only in its `home` card.
- The "everything doable now" view is the NOW sheet, not a crowded first card.
- A card lists primary rows (every task whose `windows[0].home` is that card, whatever its status) plus 2nd-chance rows for unresolved tasks. Validation guarantees a task has at most one row per card.
- The validator adds `home-not-leaf` and `home-outside-window`.

Source: spec §3.3 "Why per-window `home`", §3.9.1, §4.8, §2, §3.6.
