# Sweep: design spec

- **Date:** 2026-09-28
- **Status:** Draft for user review
- **Sources:** `docs/prompt.md` (original brief) and the approved brainstorm summary. Where this spec and the brief disagree, this spec wins.

Decisions in this spec come with their reasons ("**Why:**"). Future sessions should treat them as settled. To change one, write a new ADR (see §9) instead of quietly deviating.

---

## 1. Overview and goals

Sweep is a game-agnostic, spoiler-light companion for replaying games. A user uploads a **guide** file that describes a game's sections, tasks and walkthroughs. Sweep turns it into a private, interactive checklist that answers questions at a glance:

- What's worth doing here?
- What closes for good if I move on?
- What's left?

The user doesn't have to read a full guide to get these answers.

**Motivation.** When replaying a game like Final Fantasy VIII, it's easy to end up glued to a guide, and that hurts immersion. Sweep is meant to be glanced at when entering a new area and then put away. Immersion is the whole point, so spoiler control matters (§5.6).

### Goals (v1)

1. Define a simple, documented guide format that a human can write by hand and an LLM can generate from an existing walkthrough. It must still express non-linear games, second chances and mutually exclusive choices.
2. Compute what's missable from availability windows, so authors never label tasks "missable".
3. Warn the user before they close something off. Clearing a section shows exactly which open tasks it closes.
4. Show "where am I / what's here / what's closing" in a bottom bar that's always visible.
5. Let a guide be fixed or regenerated mid-run without losing progress.
6. Work as a server app with accounts. It starts single-user and is designed for eventual public use. Guides are private to the uploader.
7. Treat phone portrait as the primary layout. A 4:3 landscape handheld (Retroid) must stay usable. The app is an installable PWA that resumes instantly.

### Non-goals (v1)

- Guide sharing, discovery, or public guide libraries. Guides are never shared between users.
- Zip uploads or multi-file guides. The parser is designed so zip can be added later (§3.2).
- Images in guide prose.
- Full offline-first sync. There are optimistic writes and a retry queue only (§5.7).
- Controller or d-pad navigation.
- Server-side rendering (SSR).
- Mutually exclusive routes within one guide. Write one guide per route.
- A light theme. The app is dark-first, and tokens make a light theme possible later.

---

## 2. Glossary

Use these terms consistently in code, UI copy, docs and commits.

| Term | Meaning |
|---|---|
| **guide** | The uploaded file, and the normalized model parsed from it. |
| **guide version** | One uploaded revision of a run's guide. All versions are kept. |
| **run** | One user's playthrough, bound to a guide version. Uploading a file creates a run. |
| **section** | A node in the guide's section tree. |
| **group** | A section with child sections. It is rendered as a heading. It is never cleared directly. |
| **leaf** | A section without children. It is rendered as a card. It is the only kind of section a user clears. |
| **route order** | The depth-first order of sections as written in the file. It is used for display and to define "previous" and "next". It is **not** used to decide availability. |
| **requires** | A section's prerequisite: all-of a list, or any-of `{any: [...]}`. |
| **gate** | A section's own `requires`, as satisfied or not. A leaf is unlocked when its gate and every ancestor group's gate are satisfied. |
| **unlocked / reached** | A leaf is *unlocked* when its gates are satisfied. It is *reached* when it is unlocked or cleared. A group is reached when any leaf under it is reached. |
| **window** | One availability range of a task: `{from, until, home}`. It opens when `from` is reached and closes when `until` is cleared. |
| **home** | The leaf whose card shows the task's checkbox for that window. |
| **primary window / 2nd chance** | A task's first window is its primary window. Every later window is a "2nd chance". |
| **clear** | The user marks a leaf finished. This is the only user action that moves the game forward. |
| **current** | The derived "where I am" leaf: a valid pin, otherwise the earliest unlocked, uncleared leaf. |
| **pin** | "I'm here". The user explicitly sets current. |
| **category** | An author-defined kind of task, such as Loot or Cards. It describes *what* a task is, never whether it's missable. |
| **tracked** | A category that is enabled for a run. Untracked categories are hidden everywhere. |
| **exclusive group** | Tasks of which only one can be done. Marking one done makes the others *not-chosen*. |
| **task states** | **open** (a window is open), **upcoming** (no window has opened yet), **done**, **dont-care**, **not-chosen**, **missed** (no window open and none upcoming, or "missed, 2nd chance at X" while a later window is still upcoming). |
| **resolved / unresolved** | Resolved is done, dont-care or not-chosen. Unresolved is open, upcoming or missed. |
| **HERE / NOW / CLOSING / LAST CHANCE** | The bottom-bar metrics (§4.9). |
| **orphaned progress** | Stored progress whose ID isn't in the current guide version. It is kept, and restored if the ID returns. |

---

## 3. Guide format v1

### 3.1 Design choices

**Flat YAML.** `sections` is a tree. `tasks` is a flat list that refers to sections by ID. Tasks are not nested inside sections.

**Why:**

- The data is relational. A task relates to several sections through its windows (opens here, closes there, homed somewhere else), so nesting it under any one section would misrepresent it.
- Most guides will be written by an LLM converting an existing walkthrough. Flat lists are easy to generate, diff and cross-check.
- A generated JSON Schema gives human authors autocomplete and inline errors.
- The format must stay pleasant to write by hand, because some users object to LLM authoring.

**Missable is computed, never authored.** Authors describe *when* a task is available (windows). The engine works out whether it's open, closing or missed. Categories describe what *kind* of thing a task is.

**One guide per route.** Mutually exclusive routes, such as FF7 Remake chapters that differ by choice or branching story paths, are out of scope. Authors ship one guide per route.

### 3.2 Containers

A guide is one file in one of two containers. Both produce the same normalized model.

| Container | File extensions | Contents |
|---|---|---|
| YAML | `.yaml`, `.yml` | Everything inline. Walkthroughs are YAML block scalars. |
| Markdown | `.md` | YAML front matter between `---` lines holds everything except walkthroughs. The body holds walkthroughs under `# <section-id>` headings. |

**Why single-file, not zip:**

- Uploading from a phone and pasting LLM chat output both produce a single file.
- `.md` keeps long walkthrough prose readable and out of YAML indentation.

The parser takes a **virtual file map** (`Record<path, string>`). The upload layer maps the uploaded file to `guide.yaml` or `guide.md` by extension. The map must contain exactly one of `guide.yaml`, `guide.yml` or `guide.md`. Zip support can be added later by filling the map from an archive.

**Recommendation:** use `.yaml` for hand authoring. Editors apply the JSON Schema to it: add `# yaml-language-server: $schema=<path-or-url>` as the first line. Use `.md` for LLM output and long prose. Most editors don't apply schemas to front matter.

#### Markdown container rules

1. The file must start with a line containing only `---`. The front matter ends at the next line containing only `---`. Line numbers in issues refer to the whole file.
2. The body is split at level-1 ATX headings (`# ...`) that are outside fenced code blocks.
3. Every level-1 heading must be exactly `# <section-id>`, where `<section-id>` is an existing section, group or leaf. Anything else is an error. The error message says: "level-1 headings must be section IDs; use `##` or deeper inside a walkthrough".
4. Each section ID may appear as a heading at most once. A section with a body heading must not also have an inline `walkthrough` in the front matter.
5. The text under a heading, up to the next level-1 heading, is that section's walkthrough. Leading and trailing blank lines are trimmed.
6. Non-blank text between the front matter and the first heading is ignored and produces a warning.

### 3.3 Field reference

IDs are **flat, unique and bare**. They are never paths.

- **Slug rule:** `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, 64 characters or fewer. IDs start with a letter so YAML never reads them as numbers.
- **Namespaces:**
  - Sections and tasks share one namespace.
  - Categories have their own namespace.
  - Exclusive-group names have their own namespace.
- **Reserved:** `end` can't be used as a section or task ID.

#### Top level

| Field | Type | Req. | Default | Notes |
|---|---|---|---|---|
| `sweep` | integer | yes | none | Format version. Must be `1`. |
| `game` | string | yes | none | Game name, 1–120 characters. |
| `title` | string | no | `game` | Display name for this guide, such as "100% checklist". 120 characters or fewer. |
| `categories` | map `id → category` | if tasks exist | `{}` | Key order is display order within cards. |
| `sections` | list of section | yes | none | Needs at least one leaf. File order is route order. |
| `tasks` | list of task | no | `[]` | File order is display order within a card's category list. |

#### Category

| Field | Type | Req. | Default | Notes |
|---|---|---|---|---|
| `name` | string | yes | none | 1–40 characters, plain text. |
| `about` | string | yes | none | 1–300 characters, plain text. Shown in the category toggles. |
| `tracked` | boolean | no | `true` | Default tracked state for new runs. The user can override it per run. |

#### Section

| Field | Type | Req. | Default | Notes |
|---|---|---|---|---|
| `id` | slug | yes | none | Unique among sections and tasks. |
| `title` | string | yes | none | 1–120 characters, plain text. |
| `overview` | string | yes | none | One sentence, plain text. Hard limit 500 characters. A warning appears above 200. |
| `walkthrough` | Markdown | no | none | Up to 100,000 characters. In `.md` guides, prefer the body heading. |
| `requires` | list of IDs, or `{any: [IDs]}` | no | see below | IDs may name leaves or groups. A group counts as cleared when all its leaves are cleared. |
| `spoiler` | boolean | no | `false` | See §5.6. |
| `renamed_from` | slug or list of slugs | no | `[]` | Previous IDs of this section (§4.11). |
| `sections` | list of section | no | none | Present and non-empty means this section is a group. Empty lists are an error. |

**`requires` forms:**

- Omitted (leaf): the previous leaf in route order. The first leaf defaults to `[]`.
- Omitted (group): `[]`.
- `[]`: no requirement of its own.
- `[a, b]`: all of `a` and `b` must be cleared.
- `{any: [a, b]}`: at least one must be cleared.

Mixing the forms (for example a list containing `{any: ...}`) isn't supported in v1.

A group's `requires` is a gate on every section inside it. The children's own `requires` still apply, including their defaults.

#### Task

| Field | Type | Req. | Default | Notes |
|---|---|---|---|---|
| `id` | slug | yes | none | Unique among sections and tasks. |
| `title` | string | yes | none | 1–200 characters, plain text. |
| `category` | category ID | yes | none | Must be defined in `categories`. |
| `windows` | list of window | yes | none | 1–8 windows, in route order, not overlapping. |
| `how` | Markdown | no | none | Up to 10,000 characters. Revealed by tapping the title. |
| `exclusive` | slug | no | none | Exclusive-group name. Every group needs at least 2 tasks. |
| `spoiler` | boolean | no | `false` | See §5.6. |
| `renamed_from` | slug or list of slugs | no | `[]` | Previous IDs of this task. |

#### Window

| Field | Type | Req. | Default | Notes |
|---|---|---|---|---|
| `from` | section ID | yes | none | Leaf or group. The window opens when `from` is reached. |
| `until` | section ID or `end` | no | `from` | Leaf or group. The window closes when `until` is cleared. `end` means it never closes. |
| `home` | leaf ID | no | first leaf of `from` | The card that shows this window's checkbox. It must be a leaf within the window. |

"Within the window" and "in route order" use leaf positions. Let `first(s)` and `last(s)` be the route-order positions of the first and last leaf in `s`; for a leaf, both are the leaf's own position. For `until: end`, `last` is the last leaf.

**Why per-window `home`:** it solves the Breath of the Wild problem. About 700 tasks become doable the moment you leave the Great Plateau. Without `home`, they'd all land in the first open-world card. Windows are invisible metadata that drive computed state, and `home` decides placement (§3.8.1). The "everything doable now" view is the NOW sheet (§4.9).

**Why event-based closure:** a window closes when `until` is *cleared*, not when the user's route position passes it. This stays correct in non-linear games where the user visits sections in any order. Route order is only display order and the definition of "next".

### 3.4 Prose and Markdown

- `title`, `overview`, `game`, category `name` and `about` are **plain text**. Markdown in them isn't rendered.
- `walkthrough` and `how` use **CommonMark plus GFM** tables, strikethrough and autolinks.
- Raw HTML is never rendered. It is shown escaped, and validation warns about it.
- Images (`![..](..)`) are not rendered in v1. They show as their alt text, and validation warns about them.
- Links are allowed only for `http:`, `https:` and `mailto:`. They open in a new tab with `rel="noopener noreferrer"`.
- Headings inside prose are rendered at reduced size so they sit inside a card. In the `.md` container, prose headings must be level 2 or deeper (§3.2).

### 3.5 YAML rules

- YAML 1.2 core schema, one document only.
- Duplicate keys are an error. Custom tags are an error.
- Anchors and aliases are allowed, with at most 100 alias expansions.
- UTF-8 only. A BOM is accepted and stripped.

### 3.6 Validation

The validator returns a list of **issues**: `{severity, code, message, file, line, column, path}`. `path` is the YAML path, for example `tasks[12].windows[0].home`.

- Any **error** rejects the upload.
- **Warnings** are shown in the report but don't block.
- Every issue has a stable `code` so tests and the guide-writing skill can key on it.

#### Errors

| Code | Rule |
|---|---|
| `encoding` | The file isn't valid UTF-8. |
| `too-large` | The file is over 2 MiB. |
| `no-root-file` | The virtual file map lacks exactly one `guide.yaml`, `guide.yml` or `guide.md`. |
| `yaml-syntax` | YAML parse error, multiple documents, duplicate key, custom tag, or alias limit exceeded. |
| `md-front-matter` | A `.md` file doesn't start with a closed `---` front-matter block. |
| `format-version` | `sweep` is missing or isn't `1`. |
| `required` | A required field is missing. |
| `type` | A field has the wrong type, an empty `sections: []`, or `requires` is in an unsupported shape. |
| `id-format` | An ID, category ID, exclusive name or `renamed_from` entry isn't a valid slug. |
| `id-duplicate` | An ID is used twice in the section/task namespace, or a category key is duplicated. |
| `id-reserved` | A section or task uses the ID `end`. |
| `no-leaves` | The guide has no leaf sections. |
| `unknown-section` | `requires`, `from`, `until` or `home` names a section that doesn't exist. |
| `unknown-category` | A task's `category` isn't defined. |
| `requires-empty-any` | `{any: []}`. |
| `requires-lineage` | A section requires itself, one of its ancestors, or one of its descendants. |
| `requires-cycle` | The dependency graph has a cycle. The graph includes default `requires`, group gates, and any-of edges (checked conservatively). |
| `home-not-leaf` | `home` names a group. |
| `home-outside-window` | `home` isn't within `first(from)` … `last(until)`. |
| `until-before-from` | `last(until)` < `first(from)`. |
| `window-order` | Windows overlap or are out of order. The check is `first(windows[i].from) > last(windows[i-1].until)`. |
| `end-not-last` | `until: end` appears on a window other than the last. |
| `exclusive-single` | An exclusive group has fewer than 2 tasks. |
| `rename-conflict` | A `renamed_from` entry equals any current section or task ID, the element's own ID, or an entry claimed by another element. |
| `md-heading` | A `.md` level-1 heading isn't a bare section ID. |
| `md-unknown-section` | A `.md` heading names a section that doesn't exist. |
| `md-duplicate-section` | The same section heading appears twice. |
| `walkthrough-twice` | A section has both an inline `walkthrough` and a body heading. |
| `limit` | A limit in §3.7 is exceeded. |

#### Warnings

| Code | Rule |
|---|---|
| `unknown-key` | An unrecognized field is present. It's ignored, and the message suggests the closest known key. |
| `unused-category` | A category no task uses. |
| `overview-long` | An overview longer than 200 characters, or containing a line break. |
| `md-html` | Raw HTML in prose. It will be shown escaped. |
| `md-image` | An image in prose. It won't be shown. |
| `md-preamble` | Text before the first `# <section-id>` in a `.md` body. It's ignored. |

### 3.7 Limits

| Item | Limit |
|---|---|
| File size | 2 MiB |
| Sections | 2,000 |
| Tasks | 10,000 |
| Categories | 50 |
| Nesting depth | 5 levels |
| Windows per task | 8 |
| IDs in one `requires` | 50 |
| `renamed_from` entries per element | 20 |
| `walkthrough` | 100,000 characters |
| `how` | 10,000 characters |
| YAML alias expansions | 100 |

### 3.8 Complete example: *Lantern Keep*

This is a small fictional game. It exercises:

- default and explicit `requires`, with any-order towers
- a group gate
- a group used as `from`
- a non-default `home`
- a 2nd chance
- `until: end`
- an exclusive pair
- spoiler section and spoiler task
- an untracked category

Route order of leaves: `village`(0), `marsh`(1), `keep-gate`(2), `east-tower`(3), `west-tower`(4), `throne-room`(5), `epilogue`(6).

#### 3.8a YAML container: `lantern-keep.yaml`

```yaml
# yaml-language-server: $schema=../../schema/sweep-guide.v1.schema.json
sweep: 1
game: Lantern Keep
title: Completionist checklist

categories:
  story:
    name: Story
    about: Main-path steps.
  loot:
    name: Loot
    about: Chests, hidden items and rewards.
  quests:
    name: Side quests
    about: Optional quests given by villagers.
  lore:
    name: Lore
    about: Readable books. Off by default.
    tracked: false

sections:
  - id: act-1
    title: Act 1
    overview: Leave the village and cross the marsh.
    sections:
      - id: village
        title: Harrow Village
        overview: Stock up and find passage across the river.
        walkthrough: |
          ## Arrival
          Talk to the elder, then buy a **lantern** from the shop.

          ## Leaving
          You can row back from the marsh, but not once you reach the keep.
      - id: marsh
        title: Whisper Marsh
        overview: Follow the lantern posts to the keep.
        walkthrough: |
          Keep to the lit path. The herb patch is north of the second post.
  - id: act-2
    title: Act 2
    overview: Explore the keep's towers in either order.
    sections:
      - id: keep-gate
        title: Keep Gate
        overview: Open the gate and enter the courtyard.
      - id: east-tower
        title: East Tower
        overview: Climb the library tower.
      - id: west-tower
        title: West Tower
        overview: Climb the armory tower.
        requires: [keep-gate]
      - id: throne-room
        title: Throne Room
        overview: Confront the keeper of the lantern.
        spoiler: true
        requires: [east-tower, west-tower]
  - id: epilogue
    title: Epilogue
    overview: Return to the village as a hero.

tasks:
  - id: ferry-passage
    title: Pay the ferryman
    category: story
    windows:
      - from: village
  - id: village-chest
    title: Chest behind the mill
    category: loot
    how: Push the crate at the back of the mill aside.
    windows:
      - from: village
        until: marsh
  - id: lost-cat
    title: Find the elder's cat
    category: quests
    how: The cat hides in the village well. Lower the bucket.
    windows:
      - from: village
      - from: epilogue
        until: end
  - id: marsh-herbs
    title: Marsh herb patch
    category: loot
    windows:
      - from: marsh
        until: end
  - id: keep-history
    title: "Book: A History of the Keep"
    category: lore
    windows:
      - from: act-2
        until: end
        home: east-tower
  - id: sunblade
    title: Sunblade
    category: loot
    exclusive: armory-reward
    how: Take it from the armory rack. The other item vanishes.
    windows:
      - from: west-tower
        until: throne-room
  - id: moonshield
    title: Moonshield
    category: loot
    exclusive: armory-reward
    how: Take it from the armory rack. The other item vanishes.
    windows:
      - from: west-tower
        until: throne-room
  - id: keepers-lantern
    title: The keeper's lantern
    category: loot
    spoiler: true
    how: After the fight, examine the throne.
    windows:
      - from: throne-room
```

What the engine derives:

- **Requires.** `marsh` requires `village` (the default). `keep-gate` requires `marsh`. `east-tower` requires `keep-gate`. `west-tower` also requires `keep-gate` because it's explicit, which makes the towers any-order. `epilogue` requires `throne-room`. `act-2` has no gate.
- **Missables.** `village-chest` closes when `marsh` is cleared. `lost-cat` closes when `village` is cleared and has a 2nd chance in `epilogue`. `sunblade` and `moonshield` close when `throne-room` is cleared. `ferry-passage` and `keepers-lantern` close when their own section is cleared. `marsh-herbs` and `keep-history` never close.
- **Placement.** `keep-history` opens as soon as `keep-gate` is reached, because `from` names a group. It sits in the `east-tower` card because of `home`. Its category is untracked by default, so it's hidden until the user enables Lore.

#### 3.8b Markdown container: `lantern-keep.md`

This produces the same normalized model.

```markdown
---
sweep: 1
game: Lantern Keep
title: Completionist checklist

categories:
  story:
    name: Story
    about: Main-path steps.
  loot:
    name: Loot
    about: Chests, hidden items and rewards.
  quests:
    name: Side quests
    about: Optional quests given by villagers.
  lore:
    name: Lore
    about: Readable books. Off by default.
    tracked: false

sections:
  - id: act-1
    title: Act 1
    overview: Leave the village and cross the marsh.
    sections:
      - id: village
        title: Harrow Village
        overview: Stock up and find passage across the river.
      - id: marsh
        title: Whisper Marsh
        overview: Follow the lantern posts to the keep.
  - id: act-2
    title: Act 2
    overview: Explore the keep's towers in either order.
    sections:
      - id: keep-gate
        title: Keep Gate
        overview: Open the gate and enter the courtyard.
      - id: east-tower
        title: East Tower
        overview: Climb the library tower.
      - id: west-tower
        title: West Tower
        overview: Climb the armory tower.
        requires: [keep-gate]
      - id: throne-room
        title: Throne Room
        overview: Confront the keeper of the lantern.
        spoiler: true
        requires: [east-tower, west-tower]
  - id: epilogue
    title: Epilogue
    overview: Return to the village as a hero.

tasks:
  - id: ferry-passage
    title: Pay the ferryman
    category: story
    windows:
      - from: village
  - id: village-chest
    title: Chest behind the mill
    category: loot
    how: Push the crate at the back of the mill aside.
    windows:
      - from: village
        until: marsh
  - id: lost-cat
    title: Find the elder's cat
    category: quests
    how: The cat hides in the village well. Lower the bucket.
    windows:
      - from: village
      - from: epilogue
        until: end
  - id: marsh-herbs
    title: Marsh herb patch
    category: loot
    windows:
      - from: marsh
        until: end
  - id: keep-history
    title: "Book: A History of the Keep"
    category: lore
    windows:
      - from: act-2
        until: end
        home: east-tower
  - id: sunblade
    title: Sunblade
    category: loot
    exclusive: armory-reward
    how: Take it from the armory rack. The other item vanishes.
    windows:
      - from: west-tower
        until: throne-room
  - id: moonshield
    title: Moonshield
    category: loot
    exclusive: armory-reward
    how: Take it from the armory rack. The other item vanishes.
    windows:
      - from: west-tower
        until: throne-room
  - id: keepers-lantern
    title: The keeper's lantern
    category: loot
    spoiler: true
    how: After the fight, examine the throne.
    windows:
      - from: throne-room
---

# village

## Arrival
Talk to the elder, then buy a **lantern** from the shop.

## Leaving
You can row back from the marsh, but not once you reach the keep.

# marsh

Keep to the lit path. The herb patch is north of the second post.
```

### 3.9 Worked examples

The following examples are **illustrative**. Their windows are simplified to show the mechanics and aren't a factual guide to the games. Each one is a complete, valid guide.

#### 3.9.1 Breath of the Wild: open world, per-window `home`

```yaml
sweep: 1
game: "The Legend of Zelda: Breath of the Wild"
title: Open-world sample
categories:
  shrines:
    name: Shrines
    about: Shrines of Trials.
  koroks:
    name: Korok seeds
    about: Hidden Korok seeds.
sections:
  - id: great-plateau
    title: Great Plateau
    overview: The tutorial plateau; earn the paraglider to leave.
    sections:
      - id: plateau-shrines
        title: Plateau shrines
        overview: Clear the four plateau shrines.
      - id: paraglider
        title: The paraglider
        overview: Meet the old man at the Temple of Time.
  - id: hyrule
    title: Hyrule
    overview: The open world. Go anywhere, in any order.
    requires: [great-plateau]
    sections:
      - id: kakariko
        title: Kakariko Village
        overview: Meet Impa.
        requires: []
      - id: hateno
        title: Hateno Village
        overview: Visit the Ancient Tech Lab.
        requires: []
      - id: zoras-domain
        title: Zora's Domain
        overview: Help the Zora with Vah Ruta.
        requires: []
      - id: hyrule-castle
        title: Hyrule Castle
        overview: Face Calamity Ganon whenever you're ready.
        requires: []
tasks:
  - id: oman-au-shrine
    title: Oman Au Shrine
    category: shrines
    windows:
      - from: plateau-shrines
        until: end
  - id: korok-hateno-rock-circle
    title: "Korok: rock circle above Hateno"
    category: koroks
    windows:
      - from: hyrule
        until: end
        home: hateno
  - id: korok-kakariko-pinwheel
    title: "Korok: pinwheel balloons near Kakariko"
    category: koroks
    windows:
      - from: hyrule
        until: end
        home: kakariko
  - id: korok-zora-waterfall
    title: "Korok: top of the waterfall"
    category: koroks
    windows:
      - from: hyrule
        until: end
        home: zoras-domain
```

How it plays out:

- The `hyrule` gate (`[great-plateau]`) keeps every region locked until both plateau leaves are cleared. Each region then has `requires: []`, so all four unlock at once and can be cleared in any order.
- Every Korok window opens the moment the plateau is cleared, because `from: hyrule` is reached as soon as any `hyrule` leaf is. Each Korok appears only in its `home` card. Without `home`, all of them would default to `kakariko`, the first leaf of `hyrule`, which is the BotW problem.
- **NOW** counts every open Korok. That's the opt-in "everything doable now" view. **HERE** counts only the current card's.
- Current defaults to `kakariko`, the earliest unlocked leaf. A player heading to Hateno taps **I'm here** on Hateno.
- Nothing ever closes (`until: end`), so CLOSING and LAST CHANCE stay at 0.

#### 3.9.2 Final Fantasy VIII: a card with a 2nd chance

```yaml
sweep: 1
game: Final Fantasy VIII
title: Card sample
categories:
  cards:
    name: Cards
    about: Triple Triad cards worth chasing.
sections:
  - id: disc-1
    title: Disc 1
    overview: From the SeeD exam to the Timber mission.
    sections:
      - id: balamb-garden
        title: Balamb Garden
        overview: Get to class and prepare for the field exam.
      - id: fire-cavern
        title: Fire Cavern
        overview: Obtain Ifrit before the exam.
      - id: dollet
        title: Dollet
        overview: The SeeD field exam.
      - id: timber
        title: Timber
        overview: Meet the Forest Owls.
  - id: disc-2
    title: Disc 2
    overview: Galbadia and beyond.
    sections:
      - id: deling-city
        title: Deling City
        overview: The sorceress parade.
  - id: disc-3
    title: Disc 3
    overview: The Garden takes to the sea.
    sections:
      - id: garden-return
        title: Balamb Garden (Disc 3)
        overview: Explore the mobile Garden.
tasks:
  - id: quistis-card
    title: Quistis card
    category: cards
    how: Challenge the Trepies, Quistis's fan club, in the Garden.
    windows:
      - from: balamb-garden
        until: dollet
      - from: garden-return
        until: end
  - id: dollet-pub-card
    title: Card from the Dollet pub owner
    category: cards
    windows:
      - from: dollet
```

How it plays out, with `balamb-garden` and `fire-cavern` cleared and current = `dollet`:

- `quistis-card` is **open**. Its primary window runs from `balamb-garden` until `dollet`, and its row lives in the collapsed, cleared Balamb Garden card. The Dollet card doesn't list it.
- HERE = 1 (`dollet-pub-card`). NOW = 2. CLOSING = 2. LAST CHANCE = 1 (the pub card). The Quistis card is closing but has a later window.
- Tapping **Clear section** on Dollet shows:
  > Clearing **Dollet** closes 2 open tasks.
  > **Gone for good:** Card from the Dollet pub owner
  > **Closes until later:** Quistis card (2nd chance at Balamb Garden (Disc 3))
- After clearing, `quistis-card` is **missed, 2nd chance at Balamb Garden (Disc 3)**. It shows in red in the Balamb Garden card. It also appears in the `garden-return` card with a "2nd chance" badge, because it's unresolved.
- Once `garden-return` is reached, the task is **open** again (2nd chance). If the user checks it there, it becomes **done**. It then shows as done in Balamb Garden and leaves the `garden-return` card (§5.3). If the user had checked it on Disc 1, it would never have appeared in `garden-return`.

#### 3.9.3 Final Fantasy VI: an exclusive relic with `spoiler`

```yaml
sweep: 1
game: Final Fantasy VI
title: Relic choice sample
categories:
  relics:
    name: Relics
    about: Relics worth planning around.
sections:
  - id: world-of-balance
    title: World of Balance
    overview: The first half of the game.
    sections:
      - id: south-figaro
        title: South Figaro
        overview: Pass through the town on the way to the hideout.
      - id: returner-hideout
        title: Returner Hideout
        overview: Meet Banon and hear the Returners' plan.
      - id: lete-river
        title: Lete River
        overview: Ride the raft downstream with Banon.
tasks:
  - id: gauntlet
    title: Gauntlet
    category: relics
    exclusive: banon-relic
    spoiler: true
    how: A Returner hands you one relic; which one depends on how you answer Banon.
    windows:
      - from: returner-hideout
  - id: genji-glove
    title: Genji Glove
    category: relics
    exclusive: banon-relic
    spoiler: true
    how: A Returner hands you one relic; which one depends on how you answer Banon.
    windows:
      - from: returner-hideout
```

How it plays out:

- The Returner Hideout card shows **Relics 0/2** with two blurred titles. The user can see *that* a relic choice happens here without seeing what it is. Tapping a title reveals it.
- Checking **Gauntlet** makes Genji Glove **not-chosen**. Its row is dimmed and its checkbox is disabled. The count becomes **1/1**, because not-chosen tasks leave the total.
- Clearing the hideout with neither checked lists both (blurred) under "Gone for good". Afterwards both are **missed**.
- Exclusivity is task-level, not window-level. If a member is done in any window, its siblings are not-chosen in every window, and they disappear from any 2nd-chance cards.

---

## 4. Engine (`@sweep/core`)

The engine is a set of pure functions over `(guide, progress)`. It runs in the browser for the UI and in Node for server-side dry runs, diffs and migrations. Every derived value is recomputed from stored state. Nothing derived is persisted.

### 4.1 Normalized model

```ts
interface Guide {
  formatVersion: 1;
  game: string;
  title: string;
  categories: Category[]; // in file order
  sections: Section[];    // tree, route order
  tasks: Task[];          // file order
}
interface Category { id: string; name: string; about: string; tracked: boolean }
interface Section {
  id: string; title: string; overview: string; walkthrough: string | null;
  requires: { all: string[] } | { any: string[] }; // defaults resolved
  spoiler: boolean; renamedFrom: string[]; children: Section[]; // [] for a leaf
}
interface Task {
  id: string; title: string; category: string; how: string | null;
  windows: { from: string; until: string | 'end'; home: string }[]; // defaults resolved
  exclusive: string | null; spoiler: boolean; renamedFrom: string[];
}
```

The model carries a `MODEL_VERSION` constant. The server re-normalizes stored sources when it changes (§6.1).

### 4.2 State model

**Stored** (per run):

```ts
interface RunProgress {
  cleared: Set<string>;                         // leaf IDs
  pin: string | null;                           // leaf ID
  tasks: Map<string, 'done' | 'dont-care'>;     // absent = no user state
  tracked: Map<string, boolean>;                // category overrides; absent = guide default
}
```

Stored IDs that aren't in the guide are ignored and kept (orphaned). A stored cleared ID that now names a group is also ignored and kept.

**Derived:**

- section state (locked, available, current, cleared)
- current
- window status (upcoming, open, closed)
- task status
- card membership
- counts
- metrics
- clear impact

### 4.3 Structure helpers

- `leaves`: all leaves in route order. `pos(leaf)` is the leaf's index.
- `leavesOf(s)`: `[s]` for a leaf, otherwise all leaves under `s`. `first(s)` and `last(s)` are the positions of the first and last of them.
- `ancestors(s)`: the groups from `s`'s parent up to the root.

### 4.4 Requires and unlock

```
isCleared(s)   = s is leaf ? s ∈ cleared : every leaf in leavesOf(s) is cleared
satisfied(req) = req.all ? every id in req.all is cleared      // {all: []} → true
                         : some id in req.any is cleared
gateOpen(s)    = satisfied(s.requires)
isUnlocked(l)  = gateOpen(l) && every g in ancestors(l): gateOpen(g)     // leaf only
isReached(s)   = s is leaf ? isUnlocked(s) || isCleared(s)
                           : some leaf in leavesOf(s) is reached
```

- **Default requires.** A leaf's default is `{all: [previous leaf in route order]}`, or `{all: []}` for the first leaf. A group's default is `{all: []}`.
- **Group cleared.** A group is cleared when all its leaves are cleared. Groups are never cleared directly.
- **Requirements on groups.** A requirement naming a group is satisfied when that group is cleared (for all-of), or when any named ID is cleared (for any-of).
- **Clearing a locked leaf** is allowed after a confirmation (§5.4). The leaf becomes cleared, and its unmet requirements stay unmet. Sections that require it can unlock as usual.
- **Reopening** a cleared leaf removes it from `cleared`. Everything re-derives.

### 4.5 Section state and current

```
pinValid = pin != null && pin is a leaf in guide && !isCleared(pin)
current  = pinValid ? pin : first leaf l in route order with isUnlocked(l) && !isCleared(l)
           (null if none)

leafState(l) = isCleared(l) ? cleared
             : l == current ? current
             : !isUnlocked(l) ? locked
             : available
groupState(g) = isCleared(g) ? cleared
              : current ∈ leavesOf(g) ? current
              : !isReached(g) ? locked
              : available
```

- Pinning a locked leaf is allowed after a confirmation. It then shows as current, with a lock hint.
- Clearing the pinned leaf removes the pin in the same write (§6.3). Current then falls back to the default.

### 4.6 Window status

```
windowStatus(w) = (w.until != 'end' && isCleared(w.until)) ? closed
                : isReached(w.from) ? open
                : upcoming
```

Rules for groups:

- **`from` names a group:** the window opens when the first leaf in that group is reached.
- **`until` names a group:** the window closes only when every leaf in that group is cleared. Authors should point `until` at the leaf after which the task is really gone.
- **`until` cleared before `from` is reached** (possible in non-linear play or through a forced clear): the window counts as **closed**.

### 4.7 Task status

Rules are checked in order:

1. The stored state is `done` → **done**.
2. The stored state is `dont-care` → **dont-care**.
3. `exclusive` is set and another member of the group has the stored state `done` → **not-chosen**.
4. Some window is open → **open** `{window: first open index, secondChance: index > 0}`.
5. Every window is upcoming → **upcoming**.
6. Some window is upcoming → **missed** `{nextChance: home of the first upcoming window}`. This is "missed, 2nd chance at X".
7. Otherwise → **missed** `{nextChance: null}`. This is final.

User actions and states:

- The user can mark a task **done** in any status except not-chosen. That includes upcoming and missed: sequence breaks happen, and guides can be wrong.
- To switch an exclusive choice, the user unchecks the chosen task first.
- If stored data somehow has two done members of one group (for example after a guide update adds `exclusive`), both show as done. The remaining members are not-chosen, and nothing errors.
- "Don't care" and "done" are mutually exclusive. Setting one replaces the other, and resetting clears both.

### 4.8 Card membership and counts

A leaf card `L` lists, per **tracked** category in category order and task file order:

- **Primary rows:** every task with `windows[0].home == L`, whatever its status.
- **2nd-chance rows:** every **unresolved** task with some `windows[i].home == L`, for `i > 0`. These rows carry a "2nd chance" badge. Validation guarantees a task has at most one row per card.

Counts per card and category, over the rows listed:

```
done  = rows with status done
total = rows − dont-care − not-chosen
missed = rows with status missed       // shown in red when > 0
```

The header shows `done/total`, plus "· n missed" when missed is greater than 0. Before an exclusive choice is made, every member counts toward `total` (FF6: 0/2, then 1/1).

The group heading shows cleared leaves out of total leaves. The runs list shows cleared leaves out of total, and done tasks out of the total for tracked categories. For the runs list, each task is counted once.

### 4.9 Bottom-bar metrics

Metrics use the category filter: all tracked categories, or one tracked category.

| Metric | Definition |
|---|---|
| **HERE** | Open tasks with an open window whose `home == current`. |
| **NOW** | All open tasks. |
| **CLOSING** | `clearImpact(current).closing`: tasks that become missed if current is cleared. |
| **LAST CHANCE** | The subset of CLOSING with no later chance (`nextChance == null`). |

If `current` is null, HERE, CLOSING and LAST CHANCE are 0.

### 4.10 `clearImpact(guide, progress, leafId)`

```
before = derive(progress)
after  = derive(progress with leafId added to cleared, pin removed if pin == leafId)
closing    = tasks where before.status ∈ {open, upcoming} and after.status == missed,
             each with after.nextChance
lastChance = closing where nextChance == null
unlocks    = leaves locked in before and unlocked in after
wasLocked  = leafId is locked in before
```

- The result covers all categories. Callers filter by tracked categories and the metric filter.
- Tasks that are already missed (including those waiting on a 2nd chance) aren't listed again.
- The Clear dialog (§5.4) is built from this result, and so is the CLOSING metric.

### 4.11 `diffGuides(oldGuide, newGuide, progress?)`

`diffGuides` drives the guide-update preview (§5.8).

Matching happens **within each kind** (sections, tasks, categories):

1. Same ID in both guides → **matched**. It's **edited** if any resolved field differs. The diff reports the field names. For sections, parent and position are compared as the field `position`.
2. An unmatched new element whose `renamed_from` contains an unmatched old ID of the same kind → **renamed** `{from, to}`, plus any other edited fields. A `renamed_from` entry that isn't in the old guide is ignored silently, because stale rename history is normal.
3. Any remaining new elements are **added**. Any remaining old elements are **removed**.

Categories have no `renamed_from` in v1. A renamed category shows as removed plus added.

Resolved fields are compared with defaults filled in. So inserting a section flags the next leaf's `requires` as edited, which is accurate.

With `progress`, the diff also reports:

- **migrated:** renames where progress exists under the old ID. This covers cleared, task state, pin and category prefs.
- **orphaned:** removed IDs, or IDs whose kind now ignores them (such as a leaf that became a group), that have stored progress. That progress is kept, not used.
- **restored:** stored IDs that were not in the old guide but are in the new one. Their previously orphaned progress comes back.

The diff sets **`likelyRegenerated`** when the old guide has 10 or more sections and tasks combined, and at least 50% of them are removed while 50% or more of the new ones are added. The UI shows a prominent warning in that case.

`migrateProgress(progress, diff)` applies renames. If progress already exists under the new ID, it wins and the old entry stays orphaned. The server uses this inside the apply transaction (§6.3).

**Why `renamed_from` and a diff preview:**

- Fixing a guide mid-run must not wipe progress.
- LLM regeneration may change every ID. The preview exposes that *before* applying, and orphaned progress is kept and comes back if the IDs return.

### 4.12 Public API (sketch)

| Entry point | Exports | Used by |
|---|---|---|
| `@sweep/core` | model types; `deriveRun`, `clearImpact`, `diffGuides`, `migrateProgress`; API DTO types (types only) | client, server |
| `@sweep/core/parse` | `parseGuide(files: Record<string, string>): {guide?: Guide; issues: Issue[]}`, issue codes, limits | server, CLI |
| `sweep` bin | `sweep validate <file> [--json]` | authors, LLM loops, CI |

The parser is a separate entry point so the client doesn't bundle the YAML and Markdown parsing stack. Upload validation runs on the server (§6.3). Performance target: `deriveRun` plus metrics on a 10,000-task guide finishes in under 50 ms on a mid-range phone. The client memoizes it with `computed()` signals.

---

## 5. UI (`@sweep/client`)

### 5.1 Screens

1. **Sign in:** email and password.
2. **Runs:** list of the user's runs, most recently played first. Each row shows the run name, game, cleared leaves out of total, and last played. There's a **New run** button.
3. **New run:**
   - Pick a `.yaml`, `.yml` or `.md` file. The server dry-runs it and shows a validation report: errors block, warnings are collapsible, each issue shows line and column, and there's a summary of sections, tasks and categories.
   - Name the run. The default is the guide `title`.
   - **Create** opens the run view.
4. **Run view:** top bar (run name, ☰), the section list, and the bottom bar.

### 5.2 Run view

- **Group heading:** title, overview, cleared/total leaves, and a Walkthrough link if one exists (it opens a sheet). A heading can be collapsed to hide its children. Fully cleared groups start collapsed.
- **Leaf card:**
  - **Header:** title, plus the open-task count for tracked categories.
  - **States:**
    - *cleared:* collapsed and struck through
    - *locked:* grey with a lock icon and "Requires: …"
    - *current:* expanded and highlighted
    - *available:* collapsed
  - Any card can be expanded manually.
- **Expanded card:**
  - overview
  - **Walkthrough**, collapsed by default and rendered as Markdown
  - one collapsible list per tracked category with its count header
  - actions: **I'm here** and **Clear section** (or **Reopen section** on a cleared card)
- **Task row:**
  - The checkbox marks it done.
  - Tapping the title expands `how` inline.
  - The ⋯ menu has **Don't care** and **Reset**.
  - Badges:
    - "2nd chance" on non-primary rows
    - "Missed" in red, or "Missed · 2nd chance at *X*"
    - "Last chance" when the task is in LAST CHANCE
    - "Not chosen" (dimmed, checkbox disabled)
- **☰ menu:**
  - **Jump to section:** the tree, with current marked
  - **Categories:** a tracked toggle per category, with `about`
  - **Update guide** (§5.8)
  - **Rename run**
  - **Delete run:** the confirmation dialog repeats the run name
- **On open:** the view scrolls to the current card.

### 5.3 Checking tasks

- Rows change status in place.
- A 2nd-chance row that becomes resolved while visible stays in place, struck through, until the card is collapsed or the view reloads. Rows don't jump out from under the finger. Membership then follows §4.8.

### 5.4 Clear and pin

- **Clear section:**
  - Call `clearImpact`, filtered to tracked categories.
  - If the leaf is unlocked and nothing is closing, clear immediately and show an **Undo** toast.
  - Otherwise show a confirmation sheet:
    - **Locked warning** (if locked): "*X* is locked (requires *Y*). Clear anyway?"
    - **Impact:** "Clearing *X* closes *n* open tasks", with **Gone for good** and **Closes until later** (each with "2nd chance at *Z*") lists
    - **Buttons:** **Clear anyway** and **Cancel**
  - After clearing, the card collapses, the new current expands, and the view scrolls to it.
- **I'm here:** sets the pin. On a locked leaf, it asks for confirmation first. On the current card, the button reads **Unpin** and removes the pin.

**Why explicit Clear plus an optional pin:** position can't be inferred reliably in non-linear games. Clearing is the one action that changes what's missable, so it's explicit and comes with an impact warning. That warning is the key feature. The pin handles "I'm somewhere else right now" without faking clears. This model was the user's own proposal.

### 5.5 Bottom bar

- **Layout:** four always-visible numbers (HERE · NOW · CLOSING · LAST CHANCE) and a category filter chip (default "All tracked").
- **Highlights:** LAST CHANCE is highlighted when it's above 0, and CLOSING is emphasized.
- **Sheets:** tapping a number opens a sheet listing those tasks, grouped by home section. Rows are fully interactive (checkbox, how, ⋯).

### 5.6 Spoilers (layered reveal)

| Layer | What | Default |
|---|---|---|
| 0 | Section titles and overviews, task titles, categories, counts, metrics | Visible |
| 1 | `how`, walkthroughs | Hidden until tapped or expanded |
| 2 | `spoiler: true` task titles and `how` | Blurred until tapped or until the task is done |
| 2 | `spoiler: true` section title and overview | Blurred while the section is locked. Normal once it's reached. |

- Blurring applies everywhere the text appears: cards, sheets, the Clear dialog, Jump to section, and the diff preview's lists.
- A tap reveals that single item for the rest of the session. Reveals aren't persisted.

**Why:** immersion is the whole motivation. Blurred rows still show that *something* matters here (and in which category) without saying what.

### 5.7 Writes, resume, PWA

- **Optimistic writes:** every mutation updates local signal state at once and is added to a **retry queue**. The queue is saved in `localStorage` per user and processed in order, one at a time.
  - Consecutive writes to the same key are coalesced to the latest. Every write is an idempotent `PUT` (§6.2).
  - Network errors, 5xx, 408 and 429 are retried with exponential backoff (1 s up to 60 s). The queue also retries on the `online` event and on app focus.
  - Any other 4xx drops the operation, refetches the run and shows a toast.
  - A small "n unsaved" indicator shows while the queue isn't empty.
  - Update guide is disabled until the queue is empty.
- **Multiple devices:** last write wins. On focus, the client flushes the queue and then refetches the run.
- **Resume:**
  - The last opened run ID and its last payload are cached in `localStorage`. Every access is wrapped in try/catch, and the app works without it.
  - On launch with a valid session, the app opens that run immediately from cache and scrolls to current, then revalidates with the server.
  - While offline, a cached run renders and writes queue up. Nothing more is offered offline.
- **PWA:** `@angular/pwa`. The service worker caches the app shell only, never `/api/*`. The manifest uses `display: standalone`. When a new version is available, a "Reload to update" prompt appears.

**Why a PWA with instant resume:** there are two usage patterns. The phone sits beside the handheld, or the user alt-tabs on the handheld itself. Either way, it has to reopen exactly where it was.

### 5.8 Update guide

1. From ☰, choose **Update guide**, then pick a file.
2. The server dry run (`POST /api/runs/:id/guide?dryRun=true`) returns the validation report and the diff.
3. **Preview:**
   - Added, edited, removed and renamed counts per kind, as expandable lists (edited items name the fields that changed).
   - Progress effects: "n entries migrated through renames; n orphaned (kept, restored if the IDs return); n restored".
   - If `likelyRegenerated` is set, a prominent warning: "Most IDs changed. Was this guide regenerated? Progress for n items will be orphaned."
   - An identical file shows "No changes", and there's nothing to apply.
4. **Apply** or **Cancel**. Apply sends the same file with `baseVersion`. On a 409 (a newer version exists), the client refetches and asks the user to review again.

### 5.9 Responsive rules and styling

- **Phone portrait** is primary: one column, with touch targets of at least 44 px. The bottom bar is fixed, and sheets open from the bottom.
- **4:3 landscape** must stay usable. It's targeted with `(orientation: landscape) and (max-height: 800px)`. Height is the scarce resource there:
  - The content column is centered, 720 px at most.
  - The bottom bar shrinks to one slim row.
  - Sheets open as a right-side panel (480 px at most) instead of from the bottom.
- No horizontal page scroll at any size. Keyboard focus order is sensible, but there's no controller or d-pad navigation.
- **Styling:** Tailwind CSS 4. Design tokens are CSS custom properties in one tokens file, exposed to Tailwind through `@theme`: surface, text, accent, the status colors open/missed/last-chance/not-chosen, spacing and radius. Only dark tokens ship in v1, and components never use raw colors.

---

## 6. Server and data (`@sweep/server`)

**Stack:** Express 5 (ESM), Drizzle ORM, Postgres 16, Better Auth (email and password), and `@sweep/core` for parsing, diffing and migration.

**Accounts.** Guides are private to their uploader and never shared. The operator doesn't want responsibility for guide content. The app starts single-user but is built with per-user ownership everywhere, so it can go public later.

- Sign-up is off unless `SIGNUP_ENABLED=true`.
- The operator creates the first account with a server script (`pnpm --filter @sweep/server create-user`).

### 6.1 Tables

Better Auth owns `user`, `session`, `account` and `verification`, generated through its Drizzle adapter. Sweep's tables:

**`runs`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | text FK → `user.id` | on delete cascade; indexed |
| `name` | text | 1–100 characters |
| `current_version` | int | → `guide_versions.version` for this run |
| `pinned_section_id` | text null | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | bumped on every progress write ("last played") |

**`guide_versions`** (every version is kept)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `run_id` | uuid FK → `runs.id` | on delete cascade |
| `version` | int | 1, 2, …; unique (`run_id`, `version`) |
| `filename` | text | original name, for display |
| `container` | enum `yaml` \| `md` | |
| `source` | text | the uploaded file, which is the source of truth |
| `source_bytes` | int | used for quotas |
| `sha256` | text | used to spot identical re-uploads |
| `model` | jsonb | normalized `Guide` cache |
| `model_version` | int | re-normalized from `source` when core's `MODEL_VERSION` changes |
| `game`, `title` | text | denormalized for the runs list |
| `created_at` | timestamptz | |

**`section_progress`**: PK (`run_id`, `section_id`), plus `cleared_at timestamptz`. A row means the section is cleared.

**`task_progress`**: PK (`run_id`, `task_id`), plus `state enum('done','dont-care')` and `updated_at`. No row means no state.

**`category_prefs`**: PK (`run_id`, `category_id`), plus `tracked boolean`. No row means the guide default.

Progress tables have no foreign key to guide contents, so orphaned rows persist naturally. Progress is never deleted on a guide update. It's deleted only with its run.

### 6.2 API

All endpoints are JSON under `/api`. Every endpoint needs a session except health and auth. Errors look like `{error: {code, message, issues?}}`.

| Method | Path | Body / query | Result |
|---|---|---|---|
| GET | `/api/health` | none | `{ok, db}` |
| * | `/api/auth/*` | Better Auth | sign in, sign out, session |
| GET | `/api/runs` | none | runs list with summary stats |
| POST | `/api/runs` | multipart `file`, `name?`; `?dryRun=true` | dry run: `{issues, summary}`. Otherwise `201 {runId}`, or `422 {issues}` |
| GET | `/api/runs/:runId` | none | `{run, guide, progress}`: the single payload the client engine runs on |
| PATCH | `/api/runs/:runId` | `{name}` | updated run |
| DELETE | `/api/runs/:runId` | none | `204`. Deletes the run, its versions and its progress. |
| PUT | `/api/runs/:runId/sections/:sectionId` | `{cleared: boolean}` | `204`. Clearing the pinned leaf also clears the pin. |
| PUT | `/api/runs/:runId/pin` | `{sectionId: string \| null}` | `204` |
| PUT | `/api/runs/:runId/tasks/:taskId` | `{state: 'done' \| 'dont-care' \| null}` | `204` |
| PUT | `/api/runs/:runId/categories/:categoryId` | `{tracked: boolean \| null}` | `204` (`null` resets to the guide default) |
| POST | `/api/runs/:runId/guide` | multipart `file`, `baseVersion`; `?dryRun=true` | dry run: `{issues, diff}`. Apply: the new payload. `409` if `baseVersion` is stale, `422` on errors. |

Write endpoints check that the ID exists and has the right kind in the **current** guide version: a leaf for sections and pins, a task, or a category. Otherwise they return `422`. Exclusivity and locks aren't enforced on the server. They're derived views, and the client confirms locked actions.

### 6.3 Upload and update flows

**Create:**

1. The client sends `POST /api/runs?dryRun=true`. The server:
   - checks size and extension
   - maps the file to `guide.<ext>`
   - runs `parseGuide`
   - returns issues and a summary
   - writes nothing
2. The user confirms, and the client sends `POST /api/runs`. The server re-parses. In one transaction it inserts `runs` and `guide_versions` (version 1).

**Update:**

1. The client sends `POST …/guide?dryRun=true`. The server:
   - parses the file
   - loads the current model and the progress
   - returns `diffGuides(current, next, progress)`, plus issues
2. **Apply**, in one transaction:
   - re-parse the file
   - check `baseVersion == current_version`, returning `409` otherwise
   - insert `guide_versions` (n+1)
   - apply `migrateProgress` renames to `section_progress`, `task_progress` and `runs.pinned_section_id`
   - set `current_version`
   - return the new payload

### 6.4 Security

- **Ownership guard:**
  - Every `/runs/:runId` route loads the run by `id` and `user_id`.
  - A run the user doesn't own returns `404`, never `403`.
  - No endpoint can reach another user's guide or progress. There are no public or share URLs.
- **Sessions:**
  - Better Auth cookies are `httpOnly`, `Secure` and `SameSite=Lax`.
  - Better Auth checks the origin, and state-changing `/api` requests must come from the same origin (the `Origin` header is checked).
- **Input validation:**
  - Every body, param and query is schema-validated.
  - ID params must match the slug regex.
  - Uploads are a single file of 2 MiB or less, held in memory, UTF-8, with a `.yaml`, `.yml` or `.md` extension. The declared content type is ignored.
- **Parser hardening:** YAML follows §3.5 (alias cap, no custom tags) and the limits in §3.7. Parsing is synchronous and bounded by those limits.
- **Prose rendering (client):**
  - Markdown is rendered with raw HTML disabled, images disabled and a link-scheme allowlist.
  - The output then goes through **DOMPurify** before being bound. Angular's sanitizer runs as a further layer.
- **Headers:**
  - `helmet` with a strict CSP: `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; img-src 'self' data:; connect-src 'self'`.
  - `style-src 'self'` plus whatever Angular's runtime component styles need. A nonce through `ngCspNonce` is preferred, and `'unsafe-inline'` for styles only is the accepted fallback.
  - Inline scripts are never allowed.
- **Rate limits:**
  - auth: 10/min per IP
  - uploads (both `POST` upload routes): 30/hour per user
  - other API calls: 600/min per user
- **Logging:** logs never contain guide content or file bodies.

### 6.5 Quotas and limits

| Item | Limit | Error |
|---|---|---|
| Upload size | 2 MiB | `413` |
| Runs per user | 50 | `409 quota-runs` |
| Guide versions per run | 100 | `409 quota-versions` |
| Stored guide source per user (all versions) | 100 MiB | `409 quota-storage` |
| Guide content limits | §3.7 | `422` |

---

## 7. Architecture and repo layout

```
sweep/                        pnpm workspace root (git branch: master)
├── CLAUDE.md                 lean root instructions (§9)
├── package.json  pnpm-workspace.yaml  tsconfig.base.json
├── eslint.config.js  .prettierrc  .editorconfig  lefthook.yml
├── docker-compose.yml  Dockerfile  .env.example  .mcp.json
├── .claude/settings.json  .claude/skills/write-sweep-guide/
├── .github/workflows/ci.yml
├── docs/
│   ├── prompt.md             original brief
│   ├── guide-format.md       authoritative authoring doc
│   ├── adr/                  architecture decision records
│   └── superpowers/{specs,plans}/
├── schema/sweep-guide.v1.schema.json   generated, committed
├── guides/examples/          valid example guides (Lantern Keep, samples from §3.9)
└── packages/
    ├── core/    @sweep/core    model, parser, validator, engine, diff, CLI
    ├── server/  @sweep/server  Express API, Drizzle schema and migrations, auth
    └── client/  @sweep/client  Angular app
```

### Package boundaries

- **`@sweep/core` is pure.**
  - The library entries (`@sweep/core`, `@sweep/core/parse`) do no I/O and have no framework or Node-only APIs. No `fs`, `process`, DOM or Angular.
  - The parser takes a virtual file map.
  - The only exception is `src/cli/`, which reads files into the map and prints results. ESLint enforces the rule.
  - Allowed dependencies are pure libraries: YAML parsing with positions (`yaml`), a CommonMark parser for the validator's HTML and image checks, and a schema library (Zod 4 recommended) that the JSON Schema is generated from.
- **Dependency direction:** `client → core` and `server → core`. Client and server never import each other.
- **API DTO types** live in core as types only, so both sides share one contract.
- **`@sweep/client`:**
  - **Framework:** Angular 22.2, standalone components and signals. No NgModules and no SSR.
  - **Styling:** Tailwind CSS 4 through `@tailwindcss/postcss`, with design tokens in CSS custom properties consumed by `@theme`.
  - **Tooling:** TypeScript 6, Vitest 5, `@angular/pwa`.
  - **Rendering prose:** a Markdown renderer plus DOMPurify.
  - **Engine:** the core engine is wrapped in `computed()` signals.
- **`@sweep/server`:**
  - Express 5 in ESM with `.js` import extensions (a convention carried over from `~/dev/expedition`).
  - Drizzle, with migrations generated and reviewed.
  - Routes are one router per resource.
- **Node:** the current LTS, pinned through `engines` and `.nvmrc`.

**Why Angular and Express:** the user knows them well, which lowers the cost of reviewing AI-written code. Conventions from `~/dev/expedition` carry over: pnpm workspaces, Drizzle, ESM, one router per resource, and const-object enums.

**Why no SSR:** this is a logged-in, client-heavy app whose engine runs in the browser. SSR fights the PWA service worker and the `localStorage` resume, and it complicates deployment. `ng add @angular/ssr` becomes worth revisiting only if a public landing page appears.

### Deployment

- **Image:** one Docker image built in multiple stages. It builds core, client and server. At runtime, Express serves:
  - `/api/*`
  - the built client, with SPA fallback to `index.html` for non-API GETs
  - `ngsw-worker.js` and `ngsw.json` with `no-cache`
  - `/schema/sweep-guide.v1.schema.json`, so authors can point editors at it
- **Migrations** run at container start, before the server listens.
- **`docker-compose.yml`:** `app` plus `postgres:16` with a named volume. For development, run compose for `postgres` only, the server with `tsx watch`, and `ng serve` proxying `/api`.
- **Environment:** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SIGNUP_ENABLED`, `PORT` (documented in `.env.example`).

---

## 8. Testing strategy

- **Core (strict TDD):** write the failing test first, for every rule in §3.6 and every definition in §4.
  - **Fixture guides** live in `packages/core/test/fixtures/`:
    - `tiny-linear`: 4 leaves with default requires and one closing task
    - `botw-style`: a group gate, `requires: []` regions, group `from`, per-window `home`, `until: end`
    - `ff6-style`: an exclusive pair with `spoiler`, plus an FF8-style 2nd chance
    - `lantern-keep`: §3.8, in both containers
  - **Invalid fixtures:** one per error code, each asserting the code, line and column.
  - **Container equivalence:** the `.yaml` and `.md` forms of a guide must produce deep-equal models.
  - **Engine tests** step through progress snapshots and assert statuses, membership, counts, metrics and `clearImpact`.
  - **Invariant tests:**
    - the CLOSING metric equals `clearImpact(current).closing`
    - counts never exceed their totals
    - applying a diff's renames and then re-diffing shows no renames
  - **Examples and schema:** every file in `guides/examples/` must validate without errors in CI. A schema-drift test checks that `schema/` matches the generated output.
- **Server:**
  - Vitest and supertest against a **real Postgres**, the docker-compose service locally and a service container in CI. There are **no database mocks**. Each test file gets an isolated schema or database.
  - Tests cover:
    - ownership (another user's run returns 404)
    - auth required
    - upload limits and parser errors (422 with issues)
    - dry runs writing nothing
    - apply migrating renames in one transaction
    - stale `baseVersion` (409)
    - quotas
    - rate-limit headers
    - pin cleared on clear
- **Client:**
  - Component tests (Angular TestBed on Vitest) for:
    - the leaf card
    - the task row, including its badges, spoiler blur and not-chosen state
    - the bottom bar and its sheets
    - the Clear dialog
    - the diff preview
  - Service tests for the retry queue: coalescing, backoff, 4xx drop and refetch, and persistence.
- **E2E (Playwright):** two projects.
  - **Viewports:**
    - `phone`: 390×844 portrait, touch
    - `handheld-4x3`: 1024×768 landscape
  - **Stack:** the docker-compose stack with a seeded user.
  - **Flows:**
    - sign in
    - upload Lantern Keep
    - check a task and use don't care
    - clear with the impact dialog, then undo
    - pin
    - exclusive choice
    - update the guide with a rename, and check that progress is kept
    - reload and resume at current
    - go offline, check a task, and see it sync on reconnect

---

## 9. AI-development setup

- **Root `CLAUDE.md`:** lean, around 150 lines or fewer. It covers:
  - what Sweep is, in two sentences
  - the glossary from §2, verbatim
  - commands: `pnpm dev | test | lint | typecheck | build | e2e | format`, `pnpm sweep validate <file>`, `pnpm db:generate | db:migrate`, `pnpm schema`
  - package boundaries, including core purity
  - the TDD rule for core
  - conventions carried over from expedition
  - pointers to this spec, `docs/guide-format.md` and `docs/adr/`
  - a "don't re-litigate ADRs" rule
- **Per-package `CLAUDE.md`** (core, server, client): package commands, local conventions and pitfalls. For example: no Node APIs outside `src/cli`; `.js` ESM imports; review migration SQL; Angular signals patterns; no raw colors, only tokens.
- **`docs/adr/`:** one short ADR per settled decision (Context / Decision / Consequences), seeded from this spec's "Why" notes:
  - flat YAML format
  - event-based window closure
  - per-window `home`
  - Clear plus pin position model
  - computed missable
  - single-file `.md` container
  - `renamed_from` with a diff preview
  - Angular and Express
  - no SSR
  - private guides with accounts
- **`docs/guide-format.md`:** the authoritative authoring doc for humans and LLMs, derived from §3. Once it's written, it and the core validator are the source of truth for the format. Changes to either must update the other and the schema.
- **`schema/`:** the JSON Schema, generated from core's schema definition by `pnpm schema` and committed. CI fails on drift.
- **`sweep validate` CLI:**
  - It prints `file:line:col severity code message` per issue and supports `--json`.
  - Exit codes: `0` means no errors, `1` means errors, and `2` means a usage error.
  - It exists for generate → validate → fix loops.
- **`.claude/skills/write-sweep-guide/`:** a skill for converting an existing walkthrough into a Sweep guide. It covers:
  - reading `guide-format.md`
  - choosing categories
  - building the section tree and `requires`
  - setting windows and `home` deliberately
  - marking spoilers
  - never inventing facts that aren't in the source
  - looping on `sweep validate` until it's clean
- **`.claude/settings.json`:**
  - A permissions allowlist: `pnpm` test, lint, typecheck, build, format and `sweep validate`; read-only git; `docker compose` for postgres.
  - A **PostToolUse hook** that runs Prettier on files changed by Edit or Write.
- **lefthook pre-commit:** Prettier and ESLint on staged files, typecheck, and core tests.
- **`.mcp.json`:** the Angular CLI MCP server.
- **GitHub Actions CI:** lint → typecheck → test (with a Postgres service) → build → Playwright (both projects). It also checks schema drift and example validation.

---

## 10. Delivery plan

Each session follows the General Rules in `docs/prompt.md`:

- subagent-driven, with an orchestrator role
- suggest sub-sessions for large isolated work
- flag compaction points
- pass the rules along

| Step | Scope | Depends on | Done when |
|---|---|---|---|
| **Scaffold** (this session) | Workspace config, and adapting `packages/client` (already created with `ng new`) into `@sweep/client` with `@angular/pwa` and Playwright. Stub core with a CLI bin, and a server with `/api/health`. Docker files. All §9 instruction files, stubs, hooks, MCP and CI. | Spec approved | `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass. Postgres comes up, the health smoke test passes, both e2e projects run, the Prettier hook fires, and lefthook blocks a bad commit. |
| **A: core** | Model, schema and JSON Schema generation, parser (both containers), validator (every §3.6 code), engine (§4), `diffGuides`, `migrateProgress`, `sweep validate`. Strict TDD with the §8 fixtures. | Scaffold | Every §8 core test passes, and the Lantern Keep and §3.9 examples validate. |
| **B: format doc, skill, examples** | `docs/guide-format.md`, the `write-sweep-guide` skill, and `guides/examples/`. | A's schema and validator. The doc can be drafted from §3 in parallel. | Examples pass `sweep validate`, and the skill has been tried on one real walkthrough excerpt. |
| **C: server** | Better Auth, Drizzle schema and migrations, runs API, upload, dry run, diff and apply, security (§6.4), quotas, create-user script. | A's parse, diff and migrate APIs. Auth and DB work can start after Scaffold. | Every §8 server test passes against real Postgres. |
| **D: client** | Every screen in §5: engine signals, retry queue, spoilers, PWA and resume, the 4:3 pass, component tests and Playwright flows. | A. C's API contract (§6.2) is enough to start, using a fake API service until C lands. | §8 client and e2e tests pass at both viewports. |

The order is Scaffold, then A, then B and C in parallel, then D. D may start after A.

---

## 11. Open questions

1. **Public launch account flows.** Email verification and password reset need outbound email, and sign-up needs an abuse policy. These aren't needed while single-user (`SIGNUP_ENABLED=false`).
2. **Hosting target.** The host, TLS termination and Postgres backups for the single image are undecided.
3. **Retroid viewport.** 1024×768 is an assumed 4:3 CSS viewport. Confirm it against the actual device's CSS resolution and DPR, and adjust the e2e project if needed.
