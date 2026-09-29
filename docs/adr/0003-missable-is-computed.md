---
status: accepted
date: 2026-09-28
---

# 0003. Missable is computed, never authored

## Context

The point of Sweep is to show at a glance what closes for good if the user moves on. Goal 2 of v1 is to compute what's missable from availability windows, so authors never label tasks "missable". Categories are author-defined kinds of task, such as Loot or Cards.

## Decision

Authors describe *when* a task is available (its windows). The engine works out whether it's open, closing or missed. Categories describe *what* kind of thing a task is, never whether it's missable.

## Consequences

- Task status, CLOSING and LAST CHANCE are derived from `(guide, progress)`. Every derived value is recomputed from stored state, and nothing derived is persisted.
- A task is missed when no window is open and none is upcoming, or "missed, 2nd chance at X" while a later window is still upcoming.
- Categories group a card's tasks by kind, and the user chooses which ones are tracked.

Source: spec §3.1 "Missable is computed, never authored", §1 Goal 2, §2, §4.
