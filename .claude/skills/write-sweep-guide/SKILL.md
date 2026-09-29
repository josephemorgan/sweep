---
name: write-sweep-guide
description: Use when converting an existing game walkthrough or guide into a Sweep guide file (.yaml or .md), or when fixing a Sweep guide that fails `sweep validate`.
---

# Write a Sweep guide

## Overview

A Sweep guide is one file that lists a game's sections in play order and the tasks worth doing in each. Sweep turns it into a checklist that warns the player, as they clear a section, which tasks close for good.

- `docs/guide-format.md` is authoritative. This skill is the conversion process; it doesn't repeat the format. Read the doc before writing a line.
- Working examples: `guides/examples/` (Lantern Keep uses every feature).
- **The guide must be faithful.** A wrong `until` either hides a closure (the player misses something) or invents one (the player is warned for nothing). Both are worse than leaving a task out.

## Inputs to confirm

Ask, or state your assumption, before converting:

1. **Source:** the walkthrough text, its title, author, URL and license (for attribution).
2. **Container:** `.md` by default for conversions; `.yaml` if the user asks.
3. **Output path.**
4. **Scope:** which part of the game (whole game, a disc, a chapter).

## Procedure

**a. Read `docs/guide-format.md` in full.** Never guess a field. An unknown key is only a warning and is silently ignored.

**b. Inventory the source before writing anything.** Make four lists, each entry with its source quote:

- Areas and story steps, in play order. Note where the player can return and where the source says they can't.
- Branch and hub points (any-order areas).
- **Closures.** Search the source for: "no going back", "point of no return", "last chance", "won't be able", "can't return", "unavailable", "sealed", "blocked", "missable", "make sure", "before you", disc or chapter ends, and characters leaving the party. Read each hit and classify it with [Deciding `until`](#deciding-until). A "last chance" or "make sure you've already" list is a closure for every item on it.
- Tasks: every collectible, optional fight, side quest or choice, with where it's available and where the source says it's lost or offered again.

**c. Categories.** Each one says what a task *is* (Loot, Cards, Side quests), never whether it's missable. `about` describes the category only ("Magic, Speed and Power Tabs."), with no game facts the source doesn't state and no wording that invites non-tasks ("…and story rewards").

**d. Section tree, in route order.**

- A leaf is a step of the main path, named for that step. Optional errands are tasks on a leaf, not leaves.
- **A leaf ends at every point of no return.** Sweep warns when a leaf is cleared. If the irreversible step (a door, a boss, a departure) happens mid-section, split it: the last-chance leaf ends just before it, and the next leaf starts with it.
- When the source places items area by area or floor by floor, make one leaf per area. Don't pile 15+ tasks on one card.
- A revisit is a new leaf with its own ID (`balamb-garden-d1`, `balamb-garden-d3`).
- Group leaves by chapter or disc. Write `requires` only where progression isn't "the previous leaf" (hubs, any-order branches).

**e. Tasks and windows.**

- A task is something the player could skip or miss. Automatic rewards and mandatory story steps aren't tasks. Add main-path steps as tasks only if the user asks for them.
- One task per thing. The location goes in the tree (its leaf, or `home`), never in the title: not "Shield (second area)".
- Every window's `from` is where the source says the task becomes available. Every `until` is a deliberate decision: see below.
- `home`: set it when the task belongs on a card other than the first leaf of `from`, especially when `from` is a group.
- Exclusive groups only when the source says only one can be had. 2nd chances only for later chances the source names, each on its own revisit leaf.

**f. Spoilers.** Section titles and overviews, task titles and category text are visible before the player gets there. Keep them spoiler-light: never name a future plot event, a surprise party member or why an area closes. Windows already say *that* it closes; the reason goes in the walkthrough, or behind `spoiler: true`. Use `spoiler: true` on story reveals and surprise rewards, and on any `how` that hints at future events.

**g. Prose.** Walkthroughs and `how` are Markdown; titles, overviews, `name` and `about` are plain text. In `.md`, each walkthrough sits under `# <section-id>`, and headings inside it are `##` or deeper. Follow the source's order and places: a fact stays with the place the source puts it. Write in the guide's own voice. Never "the source says" or "the author recommends".

**h. Attribution.** Credit goes in a comment at the top of the file and in the report, never in user-facing text (v1 has no credit field). In `.yaml`, a `#` comment at the top (below the schema comment, if any). In `.md`, line 1 must be `---`, so put the `#` comment on the first line inside the front matter.

**i. Validate** until 0 errors (below). **j. Write the conversion report** (below).

## Deciding `until`

**`until` is the last leaf where the task can still be done.** The window closes when that leaf is *cleared*, so naming the leaf *after* the last chance is the classic off-by-one.

Omitting `until` is itself a closure claim: it means "gone once `from` is cleared". Decide every window, in this order:

1. **The source states a closure** (a point of no return, an area that becomes unreachable, a disc or chapter ending, a character leaving the party, a "last chance" list): `until` = the last leaf before that point. Quote the sentence in the closure table.
2. **The task is a one-time event the source describes** (a boss fight, a scene you can't repeat): `until` = that event's leaf. Quote it.
3. **The source only advises an order** ("make sure to", "before X", "I'd recommend doing this first"): that is not unavailability. Check whether the source later sends the player back. If nothing else applies, use rule 4, and list the call under ambiguous calls with the quote.
4. **No sign that the task or area becomes unavailable:** `until: end`.

Later chances the source names become later windows on revisit leaves. A later chance beyond the guide's last leaf (outside the scope) is never a reason for `until: end`: close the window as the source says, keep the fallback in `how` if the source gives it, and list it in the report as an unmodeled later chance.

Never invent a closure the source doesn't support, and never drop one it states because it's inconvenient.

## Fidelity

- **Every sentence traces to a source sentence about the same place.** Paraphrase only what's stated: no embellishment ("in the same spot as …"), no game knowledge (what an item does), no fact moved to another location.
- A list under a section's "Items" header belongs to the section, not to one task. Don't pin it onto a task.
- If the source doesn't say, leave it out. A task you can't place or close from the source goes in "left out", with the reason.
- Every inferred closure cites its source sentence. Every assumption is recorded, with a quote.

## Validate loop

```sh
pnpm sweep validate <file>          # from the repo root, or pass an absolute path
pnpm sweep validate <file> --json   # read issues by code and path
```

Fix errors first, then warnings. Re-run after every batch of fixes: some errors stop later checks, so fixing one can reveal others. **Stop only at 0 errors.** Fix every warning you can; explain each one left in the report. Key on the code, not the message. For any code not below, see the doc's Errors and Warnings tables.

| Code | Usual cause → fix |
|---|---|
| `unknown-section` | A `requires`, `from`, `until` or `home` names a missing ID (typo, renamed leaf) → fix the ID or add the section. |
| `requires-cycle` | An explicit `requires` names a later leaf, which already requires this one through the default chain → remove it or fix the route order. |
| `home-outside-window` | `home` is outside `first(from)` … `last(until)` → pick a leaf inside the window. Never widen `until` just to fix this. |
| `until-before-from` | `until` precedes `from` in route order → recheck the route order and the `until` decision. |
| `window-order` | Windows overlap or are out of route order → order them; each `from` must come after the previous `until`; merge windows that share a leaf. |
| `md-heading` | A `.md` level-1 heading isn't exactly `# <section-id>` → make prose headings `##`; section headings are the bare ID. |
| `walkthrough-twice` | Inline `walkthrough` plus a body heading → keep one (in `.md`, the body). |
| `unknown-key` (warning) | A guessed or misspelled field (`missable`, `credit`, `overveiw`), silently ignored → use the suggested key or delete it. |
| `overview-long` (warning) | Over 200 characters or has a line break → one short sentence; detail goes in the walkthrough. |
| `type` | Often an unquoted `true`, `false` or `null` ID, which YAML reads as a boolean or null → rename or quote it (`id: "true"`). Also `yes`/`no` for a boolean, or `windows: []`. |

**If the validator is unavailable or prints "not implemented yet", run the hand checklist on the whole file.** A missing validator never means "done". Say in the report that you checked by hand.

- [ ] Top level: `sweep: 1`, `game`, `sections`; `categories` if there are tasks. Every category has `name` and `about`; every section `id`, `title`, `overview`; every task `id`, `title`, `category`, `windows`; every window `from`. No plain-text field is `""`. No key missing from the doc's Field reference.
- [ ] Slugs: every ID matches `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, 64 characters or fewer, unique across sections and tasks. No section or task is `end`. No unquoted `true`, `false` or `null` in an ID or reference field.
- [ ] References: every `requires`, `from`, `until`, `home` and `category` exists; `home` is a leaf.
- [ ] Overviews: one sentence, 200 characters or fewer, single-line.
- [ ] No Markdown in `game`, `title`, `overview`, category `name` or `about`.
- [ ] `.md`: line 1 is `---`; no preamble before the first heading; level-1 headings are exactly `# <section-id>`, once each; prose headings `##`+; no section also has an inline `walkthrough` (`walkthrough-twice`).
- [ ] Windows: 1–8 per task, in route order, not overlapping; `until` not before `from`; `end` only on the last window; `home` inside its window.
- [ ] `requires`: no self, ancestor or descendant; no cycle through the default chain. Every exclusive group has 2+ tasks. Every category is used.

## Conversion report

Deliver it with the guide (in your reply, or as a file next to the guide if the user asked for files). Never put it inside the guide. Fill every part; write "none" when a part is empty.

```markdown
## Conversion report: <game>, <scope>

**Counts:** <n> sections (<g> groups, <l> leaves), <t> tasks (<per category>), <w> windows, <c> 2nd chances, <s> spoilers.

**Closures** (one row per window whose `until` isn't `end`):
| Task(s) | from → until | Source sentence (quoted) |
|---|---|---|

**Assumptions and ambiguous calls:** each with the source quote and the choice made.

**Unmodeled later chances:** chances the source names beyond the guide's last leaf.

**Left out:** each omitted task or topic, and why (automatic, mandatory, out of scope, unplaceable).

**Validation:** validator output summary (or "hand checklist, validator unavailable"), and every remaining warning with its reason.

**Attribution:** source title, author, URL, license.
```

## Red flags

If you catch yourself thinking one of these, stop and apply the rule.

| Thought | Rule |
|---|---|
| "I'll leave `until` out; the default is fine." | Omitting `until` is a closure claim. Decide it with the four rules and quote the reason. |
| "There's a later fallback, so `until: end`." | A "last chance" or "make sure you've already" list is a closure. Model each named chance as a window; a fallback past the last leaf goes in the report. |
| "The source says 'make sure to' or 'before X', so it closes at X." | Advice isn't unavailability. Close only on a stated loss of access, and check whether the source sends the player back. |
| "The point of no return is somewhere in this section." | Split the leaf so the last-chance leaf is cleared before the irreversible step. |
| "I'll put the sub-area in the title." | Locations belong in the tree: area leaves, or `home`. |
| "The overview should say why it closes." | Visible text is spoiler-light. The reason goes in the walkthrough or behind `spoiler: true`. |
| "This detail is true in the game, and helpful." | Every sentence traces to a source sentence about the same place. No outside knowledge. |
| "These items are listed under this section, so they're this task's." | A section's item header isn't a task's contents. |
| "The player receives it, so it's loot." | Automatic rewards and mandatory steps aren't tasks. |
| "My summary mentions the assumptions." | Inventory closures first; the report quotes the source for every closure, assumption and omission. |
| "The validator isn't available, so I'm done." | Run the hand checklist. Never skip it. |
| "I'll tell the player what the source recommends." | Write in the guide's voice. Credit goes in the top comment and the report. |
| "It's still ambiguous; I'll pick one quietly." | Pick, then list it under ambiguous calls with the quote. |
