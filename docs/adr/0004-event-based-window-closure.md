---
status: accepted
date: 2026-09-28
---

# 0004. Event-based window closure

## Context

A window is one availability range of a task: `{from, until, home}`. In non-linear games the user visits sections in any order, so their position in route order doesn't say whether a task is still doable.

## Decision

A window closes when its `until` section is **cleared**, not when the user's route position passes it. Route order is only display order and the definition of "next". `until` defaults to `from`, and `until: end` means the window never closes.

## Consequences

- Window status stays correct in non-linear play.
- `until` naming a group closes the window only when every leaf in that group is cleared. Authors should point `until` at the leaf after which the task is really gone.
- `from` naming a group opens the window when the first leaf in that group is reached.
- If `until` is cleared before `from` is reached (non-linear play or a forced clear), the window counts as closed.

Source: spec §3.3 "Why event-based closure", §4.6.
