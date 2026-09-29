---
name: write-sweep-guide
description: Use when converting an existing game walkthrough or guide into a Sweep guide file (.yaml or .md), or when fixing a Sweep guide that fails `sweep validate`.
---

# Write a Sweep guide

## Overview

A Sweep guide is one file that lists a game's sections in play order and the tasks worth doing in each. Sweep turns it into a checklist that warns the player, as they clear a leaf, which tasks close for good.

- `docs/guide-format.md` is authoritative. This skill is the conversion process; it doesn't repeat the format. Read the doc before writing a line.
- Working examples: `guides/examples/` (Lantern Keep uses every feature).
- **The guide must be faithful.** A wrong `until` either hides a closure (the player misses something) or invents one (the player is warned for nothing). Both are worse than leaving a task out.

## Inputs to confirm

Ask, or state your assumption, before converting:

1. **Source:** the walkthrough text, its title, author, URL and license (for attribution).
2. **Container:** `.md` by default for conversions; `.yaml` if the user asks.
3. **Output path.**
4. **Scope:** which part of the game (whole game, a disc, a chapter). Also whether to track optional endings and content the source says needs a replay. By default, leave them out and list them under Left out as a scope choice. If they're tracked, each is a `spoiler: true` task on the leaf where the source puts its chance.

## Procedure

**a. Read `docs/guide-format.md` in full.** Never guess a field. An unknown key is only a warning and is silently ignored.

**b. Inventory the source before writing anything.** Make four lists, each entry with its source quote:

- Areas and story steps, in play order. Note where the player can return and where the source says they can't.
- Branch and hub points (any-order areas).
- **Closures.** Search the source for: "no going back", "point of no return", "last chance", "won't be able", "can't return", "unavailable", "sealed", "blocked", "missable", "make sure", "before you", disc or chapter ends, and characters leaving the party. Read each hit and classify it with [Deciding `until`](#deciding-until). A list framed by a stated closure ("last chance", "no going back") is a closure for every item on it. "Make sure" or "before you" on its own is advice (rule 3): search for them to find framed lists, but they count only when a stated closure frames them.
- Tasks: every collectible, optional fight, side quest or choice, with where it's available and where the source says it's lost or offered again.

**c. Categories.** Each one says what a task *is* (Loot, Cards, Side quests), never whether it's missable. `about` describes the category only ("Triple Triad cards worth chasing.", "Hidden Korok seeds."), with no game facts the source doesn't state, and never widens it to things that aren't tasks, such as rewards the story hands over automatically.

**d. Section tree, in route order.**

- A leaf is a step of the main path, named for that step. Optional errands are tasks on a leaf, not leaves, even when the source gives them their own heading: fold that content into the leaf where the errands become available (as tasks, with the prose in its walkthrough). Check every leaf title: if it names an errand rather than a step (a source heading such as "Treasure Hunting"), rename the leaf for the step that happens there (an arrival, a story beat) and keep the errand as tasks on it.
- **A leaf ends at every point of no return.** Sweep warns when a leaf is cleared. If the irreversible step (a door, a boss, a departure) happens mid-section, split it: the last-chance leaf ends just before it, and the next leaf starts with it.
- If the source doesn't pinpoint the irreversible step, split just before the earliest step that could be it. Then check every task that closes there: the place the source says it's done (an NPC, a chest, a room) must fall on or before the last-chance leaf. If one doesn't, the split is too early: move it to just before the next candidate step after that place. Record the choice under ambiguous calls.
- After placing a split, re-read both leaves' titles, overviews and walkthroughs: each describes only what's now on that leaf.
- When the source places items area by area or floor by floor, make one leaf per area. Don't pile a whole dungeon's tasks onto one card.
- A revisit is a new leaf with its own ID (`balamb-garden-d1`, `balamb-garden-d3`).
- Group leaves by chapter or disc. Write `requires` only where progression isn't "the previous leaf" (hubs, any-order branches).

**e. Tasks and windows.**

- A task is something the player could skip or miss. Automatic rewards and mandatory story steps aren't tasks. (Lantern Keep's Story category is an author's choice; add main-path steps only if the user asks.)
- One task per thing. The location goes in the tree (its leaf, or `home`), never in the title: not "Chest (east wing)", but "Chest" on an `east-wing` leaf.
- Identical things on one card (two chests with the same item, three of the same optional enemy) are still one task each; never bundle them ("Three Slimes"). Title them with the name and a number in route order ("Potion 1", "Potion 2") and put the directions in `how`. Add sub-location words to a title only when there's nothing else on the card to tell them apart.
- Every window's `from` is where the source says the task becomes available. Every `until` is a deliberate decision: see below.
- Every window must include the leaf where the source puts the task's place. A window that closes before the player can reach that place invents a closure, even if the closing point is right. For an errand (a task with several steps, or one the source places only as "from this point"), the place is the leaf where it becomes available: `from` goes there, and `how` names any earlier place it sends the player back to. An errand the source names without listing its items ("go back for the chests you couldn't open") is still one task there.
- `home`: set it when the task belongs on a card other than the first leaf of `from`, especially when `from` is a group.
- Exclusive groups only when the source says only one can be had. 2nd chances only for later chances the source names, each on its own revisit leaf.

**f. Spoilers.** Section titles and overviews, task titles and category text are visible before the player gets there. Keep them spoiler-light: never name a future plot event, who joins or leaves the party, or why an area closes. Windows already say *that* it closes; the reason goes in the walkthrough, or behind `spoiler: true`. Use `spoiler: true` on story reveals and surprise rewards, and on any `how` that hints at future events. A hint needn't be phrased as a tease: a remark that implies a future party member, event or twist ("nobody in your party can use this yet") is a hint. Drop it or set `spoiler: true`.

**g. Prose.**

- Walkthroughs and `how` are Markdown; titles, overviews, `name` and `about` are plain text. In `.md`, each walkthrough sits under `# <section-id>`, and headings inside it are `##` or deeper.
- Follow the source's order and places: a fact stays with the place the source puts it.
- Write in the guide's own voice. Never "the source says" or "the author recommends". Never mention the guide's own structure ("the next leaf", "this card", "window").
- Drop pointers to parts of the source the guide doesn't include ("see the Side Quests page", "read the next section for the boss"): keep any fact that comes with the pointer, and name the missing page in the report under Left out.
- Each `how` is read on its own. When the source gives a direction relative to something earlier ("east of the chest"), name that thing ("east of the Potion 1 chest").
- In YAML (`.md` front matter too), write every `how` and inline `walkthrough` as a `|` block scalar (the example guides use plain scalars where nothing needs quoting; in a conversion, `|` avoids quoting mistakes), and quote other text values as the doc's YAML rules (Quoting) say: `: `, ` #` or a leading indicator.

**h. Attribution.** Credit goes in a comment at the top of the file and in the report, never in user-facing text (v1 has no credit field). In `.yaml`, a `#` comment at the top (below the schema comment, if any). In `.md`, line 1 must be `---`, so put the `#` comment on the first line inside the front matter.

**i. Validate** until 0 errors (below). **j. Write the conversion report** (below).

## Deciding `until`

**`until` is the last leaf where the task can still be done.** The window closes when that leaf is *cleared*, so naming the leaf *after* the last chance is the classic off-by-one.

Omitting `until` is itself a closure claim: it means "gone once `from` is cleared". Decide every window, in this order:

1. **The source states a closure** (a point of no return, an area that becomes unreachable, a disc or chapter ending, a character leaving the party, a list framed by "last chance" or "no going back"): `until` = the last leaf before that point. Quote the sentence in the closure table. A closure that removes a whole area (a collapse, a sealed dungeon) closes every task in that area at the last leaf before it, unless the source says an earlier part is cut off sooner (a one-way drop, a door that locks behind you).
   A "last chance" list at a revisit is both a named later chance and its closure. Give each item on it a window on that revisit's leaves when the source puts the item's place within that revisit, and close the window at the last leaf before the stated point.
2. **The task is a one-time event the source describes, where nothing in the source says it can be repeated** (a boss fight, a scene): `until` = that event's leaf. Quote it.
3. **The source only advises an order** ("make sure to", "before X", "I'd recommend doing this first"): that is not unavailability. Check whether the source later sends the player back. If nothing else applies, use rule 4, and list the call under ambiguous calls with the quote.
4. **No sign that the task or area becomes unavailable:** `until: end`.

Later chances the source names become later windows on revisit leaves. A later chance beyond the guide's last leaf (outside the scope) is never a reason for `until: end`: close the window as the source says, keep the fallback in `how` if the source gives it, and list it in the report as an unmodeled later chance. The same goes for another way to get the same thing that the source names (a shop, a trade): if it's in scope and it's the same task (the same action, so the category still describes it), make it a window. Otherwise (a different way to get the same thing, such as buying what was a chest or an enemy drop, or a chance out of scope), say so in `how` ("Also sold later in …") and list it under unmodeled later chances, so the report shows the warning is softer than "gone for good".

Never invent a closure the source doesn't support, and never drop one it states because it's inconvenient.

## Fidelity

- **Every sentence traces to a source sentence about the same place.** Paraphrase only what's stated: no embellishment (details the source doesn't give), no game knowledge (what an item does), no fact moved to another location.
- Keep the source's strength. "You might want to" stays optional: don't harden advice into an instruction ("Before X, do Y"), which reads as a closure when the window says `end`.
- A list under a section's Items or Purchasables header belongs to the section, not to one task: never pin it on as a task's contents. It still tells you what the source says is at that place, so it counts as evidence for a later chance. Treat every item it names alike.
- If the source doesn't say, leave it out. A task you can't place or close from the source goes in "left out", with the reason.
- Every inferred closure cites its source sentence. Every assumption is recorded, with a quote.

## Validate loop

```sh
pnpm sweep validate <file>          # from the repo root, or pass an absolute path
pnpm sweep validate <file> --json   # read issues by code and path
```

Fix errors first, then warnings. Re-run after every batch of fixes: some errors stop later checks, so fixing one can reveal others. **Stop only at 0 errors.** A clean run doesn't prove the text survived: an unquoted ` #` silently cuts a value off. Before you stop, search the front matter for ` #` outside `|` blocks and `#` comment lines. Fix every warning you can; explain each one left in the report. Key on the code, not the message. For any code not below, see the doc's Errors and Warnings tables.

Exit `0` means no errors and `1` means the guide has errors. Exit `2` is a usage problem (bad path, unsupported extension, unreadable file), not a guide error: fix the command. For the output format, see the doc's `sweep validate` section.

| Code | Usual cause → fix |
|---|---|
| `yaml-syntax` | Usually an unquoted value containing `: `, or starting with `[`, `{`, `*`, `&`, `!`, `\|`, `>`, `'`, `"`, `%`, `@` or a backtick → quote it, or use a `\|` block scalar. The line:col points at it. (An unquoted ` #` gives no error: it silently cuts the value off.) |
| `unknown-section` | A `requires`, `from`, `until` or `home` names a missing ID (typo, renamed leaf), or a task ID where a section is expected (the message says it's a task) → fix the ID or add the section. |
| `requires-cycle` | An explicit `requires` names a later leaf, which already requires this one through the default chain → remove it or fix the route order. The message lists the loop in the needs direction (`requires cycle: village → keep → marsh → village`), and the error sits on the `requires` of the first cycle member in route order with an explicit `requires` into the loop. |
| `home-outside-window` | `home` is outside `first(from)` … `last(until)` → pick a leaf inside the window. Never widen `until` just to fix this. |
| `until-before-from` | `until` precedes `from` in route order → recheck the route order and the `until` decision. |
| `window-order` | Windows overlap or are out of route order → order them; each `from` must come after the previous `until`; merge windows that share a leaf. |
| `md-heading` | A `.md` level-1 heading isn't exactly `# <section-id>` → make prose headings `##`; section headings are the bare ID. |
| `walkthrough-twice` | Inline `walkthrough` plus a body heading → keep one (in `.md`, the body). |
| `unknown-key` (warning) | A guessed or misspelled field (`missable`, `credit`, `overveiw`), silently ignored → use the suggested key ("did you mean `x`?" appears only for a close typo) or, when the message lists the known keys, pick one of them or delete the field. |
| `overview-long` (warning) | Over 200 characters or has a line break → one short sentence; detail goes in the walkthrough. |
| `type` | Often an unquoted `true`, `false` or `null` in an ID or reference field, which YAML reads as a boolean or null (`` `id` must be a string; YAML read `true` as boolean, so quote it: id: "true" ``) → rename or quote it. IDs and references must be strings; plain-text fields (`game`, `title`, `overview`, `how`, …) accept numbers and booleans as written. Also `yes`/`no` for a boolean, `windows: []`, or an empty key: an ID or reference key with nothing after it says `` `from` is empty; give it a section ID `` (the noun names the kind of ID), and a plain-text key such as `how:` says `` `tasks[0].how` must be text; found an empty value `` → fill it in or delete the key. Also a value YAML read as a list or mapping: a value that is all `[…]`, or a value on the line below its key that contains `: ` → quote it, or use a `\|` block scalar. |

**If the validator is unavailable, run the hand checklist on the whole file.** A missing validator never means "done". Say in the report that you checked by hand.

- [ ] Top level: `sweep: 1`, `game`, `sections`; `categories` if there are tasks. Every category has `name` and `about`; every section `id`, `title`, `overview`; every task `id`, `title`, `category`, `windows`; every window `from`. No plain-text field is `""`. Every key appears in the doc's Field reference.
- [ ] Slugs: every ID matches `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, 64 characters or fewer, unique across sections and tasks. No section or task is `end`. No unquoted `true`, `false` or `null` in an ID or reference field.
- [ ] References: every `requires`, `from`, `until`, `home` and `category` exists; `home` is a leaf.
- [ ] Overviews: one sentence, 200 characters or fewer, single-line.
- [ ] No Markdown in `game`, `title`, `overview`, category `name` or `about`.
- [ ] Plain text values containing `: ` or ` #` are quoted or block scalars.
- [ ] Every `how` and inline `walkthrough` is a `|` block scalar.
- [ ] `.md`: line 1 is `---`; no preamble before the first heading; level-1 headings are exactly `# <section-id>`, once each; prose headings `##`+; no section also has an inline `walkthrough` (`walkthrough-twice`).
- [ ] Windows: 1–8 per task, in route order, not overlapping; `until` not before `from`; `end` only on the last window; `home` inside its window.
- [ ] `requires`: no self, ancestor or descendant; no cycle through the default chain. Every exclusive group has 2+ tasks. Every category is used.

## Conversion report

Deliver it with the guide (in your reply, or as a file next to the guide if the user asked for files). Never put it inside the guide. Fill every part; write "none" when a part is empty.

```markdown
## Conversion report: <game>, <scope>

**Counts:** <n> sections (<g> groups, <l> leaves), <t> tasks (<per category>), <w> windows, <c> 2nd chances, <s> spoilers.

**Closures** (one row per window whose `until` isn't `end`; quote the sentence that covers *this* task by name or place, and write "same sentence" only when it does):
| Task(s) | from → until | Source sentence (quoted) |
|---|---|---|

**Assumptions and ambiguous calls:** each with the source quote and the choice made.

**Unmodeled later chances:** chances the source names beyond the guide's last leaf, and in-scope alternatives that aren't the same task (another way to get the item, such as a shop or a trade), each with its quote.

**Left out:** each omitted task or topic, and why (automatic, mandatory, out of scope, unplaceable).

**Validation:** validator output summary (or "hand checklist, validator unavailable"), and every remaining warning with its reason.

**Attribution:** source title, author, URL, license.
```

## Red flags

If you catch yourself thinking one of these, stop and apply the rule.

| Thought | Rule |
|---|---|
| "I'll leave `until` out; the default is fine." | Omitting `until` is a closure claim. Decide it with the four rules and quote the reason. |
| "There's a later fallback, so `until: end`." | A later chance beyond the guide's last leaf is never a reason for `until: end`. A list framed by a stated closure ("last chance", "no going back") is a closure for every item on it; "make sure" or "before you" on its own is advice (rule 3). Model each named chance as a window; report a fallback past the last leaf. |
| "The source says 'make sure to' or 'before X', so it closes at X." | Advice isn't unavailability. Close only on a stated loss of access, and check whether the source sends the player back. |
| "The point of no return is somewhere in this section." | Split the leaf so the last-chance leaf is cleared before the irreversible step. |
| "I'll put the sub-area in the title." | Locations belong in the tree: area leaves, or `home`. |
| "The overview should say why it closes." | Visible text is spoiler-light. The reason goes in the walkthrough or behind `spoiler: true`. |
| "This detail is true in the game, and helpful." | Every sentence traces to a source sentence about the same place. No outside knowledge. |
| "These items are listed under this section, so they're this task's." | A section's item header isn't a task's contents. |
| "The player receives it, so it's loot." | Automatic rewards and mandatory steps aren't tasks, unless the user asked for main-path steps. |
| "My summary mentions the assumptions." | Inventory closures first; the report quotes the source for every closure, assumption and omission. |
| "The validator isn't available, so I'm done." | Run the hand checklist. Never skip it. |
| "I'll tell the player what the source recommends." | Write in the guide's voice. Credit goes in the top comment and the report. |
| "It's still ambiguous; I'll pick one quietly." | Pick, then list it under ambiguous calls with the quote. |
