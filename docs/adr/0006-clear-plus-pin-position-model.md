---
status: accepted
date: 2026-09-28
---

# 0006. Explicit Clear plus an optional pin

## Context

Position can't be inferred reliably in non-linear games. Clearing a section is the one action that changes what's missable, and warning the user before they close something off is v1's key feature. The user also needs a way to say "I'm somewhere else right now" without faking clears. This model was the user's own proposal.

## Decision

Progress moves only by an explicit **Clear section**, which shows the `clearImpact` warning (what closes for good and what closes until a later chance) before clearing. **I'm here** sets an optional pin. Position is never inferred: current is a valid pin, otherwise the earliest unlocked, uncleared leaf.

## Consequences

- If the leaf is unlocked and nothing is closing, Clear happens immediately with an Undo toast; otherwise a confirmation sheet shows the impact.
- Clearing or pinning a locked leaf is allowed after a confirmation.
- Clearing the pinned leaf removes the pin in the same write, and current falls back to the default.
- The CLOSING metric and the Clear dialog are both built from `clearImpact`.

Source: spec §5.4 "Why explicit Clear plus an optional pin", §4.5, §4.10.
