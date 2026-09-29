---
status: accepted
date: 2026-09-28
---

# 0002. Section tree plus a `requires` DAG

## Context

Sections carry two separate relations. Containment organizes and displays them (Disc 1 > Balamb Garden). Progression decides what unlocks when, and open worlds, hubs and converging branches have to be expressed somewhere. Coming back to a place is a new visit (Balamb Garden on Disc 1 vs. Disc 3). A general graph for containment was considered and rejected: if a leaf had several parents, clearing it would count toward several groups at once, its position in route order would be ambiguous, and "next" and card placement would stop being deterministic.

## Decision

Sections nest as a tree. The tree gives containment, route order (depth-first file order), the meaning of "next" and the default `requires`; a leaf has exactly one parent. Progression is a directed acyclic graph of `requires` edges between any sections, across branches: an all-of list (`[a, b]`) or an any-of `{any: [a, b]}`. Mixing the two forms isn't supported in v1. A revisit is a new leaf with its own ID and clear state.

## Consequences

- Open worlds, hubs and converging branches are expressed in `requires`, not in the nesting.
- A leaf's default `requires` is the previous leaf in route order (`[]` for the first leaf); a group's default is `[]`.
- A group's `requires` is a gate on every section inside it, and the children's own `requires` still apply.
- Tasks span visits through their windows rather than through a shared section.
- The validator rejects `requires-lineage` (a section requiring itself, an ancestor or a descendant) and `requires-cycle`.

Source: spec §3.1 "Two structures", §3.3 `requires` forms, §3.6.
