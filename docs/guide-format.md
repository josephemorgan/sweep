# Sweep guide format (v1)

A Sweep **guide** is one file that describes a game: its sections, in the order you play them, and the tasks worth doing along the way. Sweep reads the guide and gives each run a checklist that shows what's worth doing here, what closes for good if you move on, and what's left. This document is the authoring reference for people writing guides by hand and for LLMs converting existing walkthroughs.

**Status:** This document and the `@sweep/core` validator are co-authoritative (spec §9). Change one, update the other, and regenerate `schema/` with `pnpm schema`.

## Quick start

The smallest useful guide has one leaf section and one task:

```yaml
sweep: 1
game: Lantern Keep
categories:
  loot:
    name: Loot
    about: Chests and hidden items.
sections:
  - id: village
    title: Harrow Village
    overview: Stock up and find passage across the river.
tasks:
  - id: village-chest
    title: Chest behind the mill
    category: loot
    windows:
      - from: village
```

Save it as `my-guide.yaml` and check it from the repo root:

```sh
pnpm sweep validate my-guide.yaml
```

Exit code `0` means the guide is valid. For a complete example, see `guides/examples/lantern-keep.yaml` and the walkthrough of it below.

## Concepts

**Sections form a tree, and progression is a graph.** A guide has two separate relations between sections:

- **Containment is a tree.** Sections nest (`Disc 1 > Balamb Garden`). A section with child sections is a **group**, shown as a heading. A section without children is a **leaf**, shown as a card. A leaf has exactly one parent. The tree is for organizing and displaying sections.
- **Progression is a directed acyclic graph.** Each section's `requires` names the sections that must be cleared before it unlocks. Edges can cross branches of the tree. Open worlds, hubs and converging branches are expressed here, not in the nesting.

**Route order** is the depth-first order of sections as written in the file. It sets the display order, the default `requires` (the previous leaf), and the meaning of "previous" and "next". It does **not** decide availability: only `requires` does.

**Clearing** a leaf is the only thing that moves the game forward. The user clears leaves. Groups are never cleared directly. A group counts as cleared when all its leaves are cleared.

**Missable is computed, never authored.** There's no `missable` field. You describe *when* a task can be done, as one or more **windows** (`from` a section, `until` a section). Sweep works out whether it's open, closing or missed. A **category** says what *kind* of thing a task is (Loot, Cards, Side quests), never whether it's missable.

**One guide per route.** A guide can't express mutually exclusive routes, such as story branches decided by a choice. Write one guide per route.

**A revisit is a new leaf.** Coming back to a place is a new visit with its own ID and its own clear state. Balamb Garden on Disc 1 and Balamb Garden on Disc 3 are two leaves (for example `balamb-garden-d1` and `balamb-garden-d3`). A task that can be done on both visits spans them with its windows.

## Containers

A guide is a single file in one of two containers. Both produce the same normalized model.

| Container | File extensions | Contents |
|---|---|---|
| YAML | `.yaml`, `.yml` | Everything inline. Walkthroughs are YAML block scalars. |
| Markdown | `.md` | YAML front matter between `---` lines holds everything except walkthroughs. The body holds walkthroughs under `# <section-id>` headings. |

There are no multi-file or zip guides in v1. The extension is matched case-insensitively (`Guide.YAML` works). Internally, the uploaded file becomes `guide.yaml`, `guide.yml` or `guide.md`, and that name appears as `file` in validation issues. Any other extension is rejected.

**Which to use:**

- Use `.yaml` for hand authoring. Editors apply the JSON Schema to it and give you autocomplete and inline errors. Add this as the first line, with a path relative to your file or a URL:

  ```yaml
  # yaml-language-server: $schema=../../schema/sweep-guide.v1.schema.json
  ```

- Use `.md` for LLM output and long walkthrough prose. Prose stays readable and out of YAML indentation. Most editors don't apply schemas to front matter, so validate often.

### Markdown container rules

A `.md` guide looks like this:

```markdown
---
sweep: 1
game: Lantern Keep
sections:
  - id: village
    title: Harrow Village
    overview: Stock up and find passage across the river.
---

# village

## Arrival
Talk to the elder, then buy a **lantern** from the shop.
```

1. **Front matter.** Line 1 must be `---` (the exact test is the regex `^---[ \t]*$`, so trailing spaces or tabs are allowed). The front matter ends at the next line that matches the same regex. Otherwise it's `md-front-matter`. Issue line numbers count from the top of the whole file, so the opening `---` is line 1.
2. **Split points.** The body is parsed as CommonMark and split at level-1 ATX headings (`# ...`) at the top level of the document. A `#` line inside a fenced code block is code, not a heading.
3. **Headings are section IDs.** Every level-1 heading must be exactly `# <section-id>`, with trailing spaces or tabs allowed and nothing else, where `<section-id>` names an existing group or leaf. Anything else is `md-heading`, with the message "level-1 headings must be section IDs; use `##` or deeper inside a walkthrough". That includes:
   - extra text (`# village: arrival`) or closing hashes (`# village #`)
   - a setext heading (a line underlined with `===`)
   - an ATX heading indented by 1–3 spaces
   - a level-1 heading inside a list item or a blockquote

   A well-formed heading that names no section is `md-unknown-section`. If it names a task, the message says so.
4. **Once each.** A section ID may appear as a heading at most once (`md-duplicate-section`). A section with a body heading must not also have an inline `walkthrough` in the front matter (`walkthrough-twice`).
5. **Walkthrough text.** The text after a heading, up to the next split point, is that section's walkthrough. Leading blank lines and trailing whitespace are trimmed. Headings inside it must be level 2 or deeper.
6. **Preamble.** Non-blank text between the front matter and the first heading is ignored and gives the warning `md-preamble`. A malformed level-1 heading isn't a split point, so one that comes before every valid heading also counts as preamble: you get `md-heading` and `md-preamble` on the same line, and fixing the heading clears both.

The front matter follows the same YAML rules and field reference as a `.yaml` guide.

## IDs

Sections, tasks, categories and exclusive groups are named by IDs.

- **Slug rule:** `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, 64 characters or fewer. That's lowercase letters and digits in words joined by single hyphens, starting with a letter: `keep-gate`, `disc-2`, `balamb-garden-d1`. Breaking the rule is `id-format`.
- **Namespaces:**
  - Sections and tasks share one namespace. A task can't have the same ID as a section (`id-duplicate`).
  - Categories have their own namespace. A category's ID is its key in `categories`.
  - Exclusive-group names have their own namespace.
- **Reserved:** `end` can't be a section or task ID (`id-reserved`). It's the special `until` value that means "never closes".
- **Flat and bare.** IDs are unique within their namespace across the whole guide, and never paths. Write `west-tower`, never `act-2/west-tower` (that's `id-format`). Nesting doesn't namespace IDs.

IDs start with a letter so YAML never reads them as numbers. The slugs `true`, `false` and `null` are still read by YAML as a boolean or null, and fail validation.

The rule: **plain-text fields accept numbers and booleans (used as written); IDs and references must be strings.** Any non-string in an ID or reference field (`id`, `category`, `exclusive`, `from`, `until`, `home`, `requires` entries, `renamed_from` entries) is a `type` error. In practice this means an unquoted `null`, `true` or `false` (or `~`) used as an ID must be quoted (`"null"`, `"true"`, `"false"`), or you can pick another ID. The validator doesn't convert these to strings, and the message shows the fix:

```text
guides/my-guide.yaml:22:15 error type `from` must be a string; YAML read `null` as null, so quote it: from: "null"
guides/my-guide.yaml:18:9 error type `id` must be a string; YAML read `true` as boolean, so quote it: id: "true"
guides/my-guide.yaml:15:16 error type `requires[0]` must be a string; YAML read `false` as boolean, so quote it: "false"
```

A key with nothing after it is the same kind of mistake, and the message names the kind of value it wants: `` `from` is empty; give it a section ID `` (also `` `requires[0]` is empty; give it a section ID ``, and for `category` and `home` a category ID and a leaf section ID). An ID that is present but is the empty string `""` is an `id-format` error instead.

## Field reference

### Top level

| Field | Type | Req. | Default | Notes |
|---|---|---|---|---|
| `sweep` | integer | yes | none | Format version. Must be `1`. |
| `game` | string | yes | none | Game name, 1–120 characters, plain text. |
| `title` | string | no | `game` | Display name for this guide, such as "100% checklist". 120 characters or fewer, plain text. |
| `categories` | map `id → category` | if tasks exist | `{}` | Key order is display order within cards. |
| `sections` | list of section | yes | none | Needs at least one leaf. File order is route order. |
| `tasks` | list of task | no | `[]` | File order is display order within a card's category list. |

### Category

| Field | Type | Req. | Default | Notes |
|---|---|---|---|---|
| `name` | string | yes | none | 1–40 characters, plain text. |
| `about` | string | yes | none | 1–300 characters, plain text. Shown in the category toggles. |
| `tracked` | boolean | no | `true` | Default tracked state for new runs. The user can override it per run. Untracked categories are hidden everywhere. |

### Section

| Field | Type | Req. | Default | Notes |
|---|---|---|---|---|
| `id` | slug | yes | none | Unique among sections and tasks. |
| `title` | string | yes | none | 1–120 characters, plain text. |
| `overview` | string | yes | none | One sentence, plain text. Hard limit 500 characters. A warning (`overview-long`) appears above 200 characters or when it contains a line break. |
| `walkthrough` | Markdown | no | none | Up to 100,000 characters. In `.md` guides, prefer the body heading. |
| `requires` | list of IDs, or `{any: [IDs]}` | no | see [Requires](#requires) | IDs may name leaves or groups. A group counts as cleared when all its leaves are cleared. |
| `spoiler` | boolean | no | `false` | See [Spoilers](#spoilers). |
| `renamed_from` | slug or list of slugs | no | `[]` | Previous IDs of this section, so progress follows a rename when the guide is updated. |
| `sections` | list of section | no | none | Present and non-empty means this section is a group. An empty list is an error (`type`). |

### Task

| Field | Type | Req. | Default | Notes |
|---|---|---|---|---|
| `id` | slug | yes | none | Unique among sections and tasks. |
| `title` | string | yes | none | 1–200 characters, plain text. |
| `category` | category ID | yes | none | Must be defined in `categories`. |
| `windows` | list of window | yes | none | 1–8 windows, in route order, not overlapping. |
| `how` | Markdown | no | none | Up to 10,000 characters. Revealed by tapping the title. |
| `exclusive` | slug | no | none | Exclusive-group name. Every exclusive group needs at least 2 tasks. |
| `spoiler` | boolean | no | `false` | See [Spoilers](#spoilers). |
| `renamed_from` | slug or list of slugs | no | `[]` | Previous IDs of this task. |

### Window

| Field | Type | Req. | Default | Notes |
|---|---|---|---|---|
| `from` | section ID | yes | none | Leaf or group. The window opens when `from` is reached. |
| `until` | section ID or `end` | no | `from` | Leaf or group. The window closes when `until` is cleared. `end` means it never closes. |
| `home` | leaf ID | no | first leaf of `from` | The card that shows this window's checkbox. It must be a leaf within the window. |

### Positions: `first(s)` and `last(s)`

Window rules compare positions of leaves in route order (0 for the first leaf, 1 for the next, and so on). For a section `s`:

- `first(s)` is the position of the first leaf in `s`, and `last(s)` is the position of the last leaf in `s`.
- For a leaf, both are the leaf's own position.
- For `until: end`, `last` is the position of the last leaf in the guide.

"Within the window" means from `first(from)` to `last(until)`, both inclusive.

### Plain text, `renamed_from` and defaults

- **Plain-text scalars.** In the plain-text fields (`game`, `title`, `overview`, category `name` and `about`) and in `walkthrough` and `how`, a value YAML reads as a number or boolean is kept as you wrote it: `game: 1942` becomes the text `"1942"`, and the JSON Schema accepts them too. The same rule in short: plain-text fields accept numbers and booleans (used as written); IDs and references must be strings (see [IDs](#ids)). Other fields aren't converted: `spoiler: "true"` is a `type` error.
- **Empty text.** A plain-text field set to `""` is a `required` error ("must not be empty"). A `walkthrough` or `how` that is empty after trimming counts as absent. A key with nothing after it (`how:`) is different: YAML reads it as `null`, and that's a `type` error ("must be text; found an empty value").
- **`renamed_from`.** When you rename a section or task in a later version of a guide, list its old IDs here so the run's progress carries over. A string is the same as a one-item list. An entry must not equal any current section or task ID, or an entry claimed by another element (`rename-conflict`).

## Requires

`requires` says which sections must be cleared before a section unlocks.

| Form | Meaning |
|---|---|
| omitted, on a leaf | The previous leaf in route order. The first leaf defaults to `[]`. |
| omitted, on a group | `[]` |
| `[]` | No requirement of its own. |
| `[a, b]` | All of `a` and `b` must be cleared. |
| `{any: [a, b]}` | At least one of `a` and `b` must be cleared. |

- **Only write `requires` where progression isn't "the previous leaf".** The default already chains leaves in route order, across group boundaries.
- **Groups count as cleared** when all their leaves are cleared. `requires: [act-1]` waits for every leaf in `act-1`. In an `any` list, naming a group is satisfied when that whole group is cleared.
- **A group's `requires` is a gate** on every section inside it. A leaf is unlocked when its own gate and every ancestor group's gate are satisfied. The children's own `requires` still apply, including their defaults.
- **No mixing.** A list containing `{any: ...}` isn't supported in v1. It's a `type` error. `{any: []}` is `requires-empty-any`.
- **Unknown IDs.** Every ID must name an existing section (`unknown-section`).
- **Locked isn't a hard block.** A user can still clear a locked leaf after a confirmation. `requires` describes the game, and the app trusts the player.

Two graph errors:

- **`requires-lineage`**: a section requires itself, one of its ancestors, or one of its descendants. For example, leaf `west-tower` inside group `act-2` with `requires: [act-2]`: the group is cleared only when `west-tower` is, so it could never unlock.
- **`requires-cycle`**: the requirements form a loop. For example, `village` then `marsh` in route order, and `village` has `requires: [marsh]`: `marsh` defaults to requiring `village`, so neither can unlock. The check includes default `requires`, group gates, and both `all` and `any` edges. It's conservative: an `any` list that could escape the loop through another option still counts as a cycle.

  The message lists the cycle in the direction of "needs". With `village`, `marsh`, `keep` in route order and `requires: [keep]` on `village`, the validator says `requires cycle: village → keep → marsh → village`: `village` needs `keep`, `keep` needs `marsh` (its default), and `marsh` needs `village` (its default). The error is located at the `requires` of the first cycle member in route order whose explicit `requires` points into the cycle.

## Windows and home

A task has 1–8 **windows**. Each one is a range of the game in which the task can be done: `{from, until, home}`.

- **A window opens when `from` is reached.** A leaf is reached when it's unlocked or cleared. When `from` names a group, the window opens as soon as **any** leaf in that group is reached (unlocked or cleared), not only the group's first leaf in route order.
- **A window closes when `until` is cleared.** For a group, that's when every leaf in it is cleared. If `until` is cleared before `from` is reached (possible in non-linear play), the window is closed.
- **Closure is event-based.** A window closes when the user clears `until`, not when their position in route order passes it. That stays correct in non-linear games, where sections are visited in any order. Clearing a leaf is the moment Sweep warns about what it closes.

**`until` is the last leaf where the task can still be done.** The window closes when that leaf is cleared, so Sweep warns the user as they clear their last chance. Naming the section *after* the last chance is the classic mistake.

In Lantern Keep, you can row back to the village from the marsh, but not once you reach the keep. The chest behind the mill can be done in `village` and `marsh`, and is lost at `keep-gate`:

```yaml
# Wrong: stays open while the user stands at the keep gate, where the chest
# is already out of reach, and warns only when keep-gate is cleared.
windows:
  - from: village
    until: keep-gate
```

```yaml
# Right: marsh is the last leaf where the chest can be done. Clearing marsh
# warns that it closes.
windows:
  - from: village
    until: marsh
```

**`until` defaults to `from`.** A window with only `from` closes when `from` is cleared: the task can be done only there. For a group `from`, that means until every leaf of the group is cleared.

**`until: end`** means the window never closes. The task is never missed. Only the last window may use it (`end-not-last`).

### Home

`home` is the leaf whose card shows the task's checkbox for that window. It defaults to the first leaf of `from`.

**Why `home` exists:** in Breath of the Wild, hundreds of tasks become doable the moment you leave the Great Plateau. With `from: hyrule` and no `home`, all of them would land on the first open-world card. Setting `home` per window puts each task on the card of the region where it's actually done, while `from` and `until` still say when it's available. Tasks that are open anywhere show up in the NOW sheet (the app's list of everything doable right now) regardless of `home`.

- `home` must be a leaf (`home-not-leaf`).
- `home` must be within the window, from `first(from)` to `last(until)` inclusive (`home-outside-window`).

### Ordering rules

- `until` can't come before `from`: `last(until)` < `first(from)` is `until-before-from`.
- Windows are listed in route order and don't overlap. For each window after the first, `first(windows[i].from)` must be greater than `last(windows[i-1].until)`. Otherwise it's `window-order`. Two windows can't share a leaf.
- Only the last window may be `until: end` (`end-not-last`).

### 2nd chances

The first window is the **primary window**. Every later window is a **2nd chance**. The task always shows on the `home` card of its primary window. While it's unresolved (not done, not marked "don't care", and not ruled out by an [exclusive group](#exclusive-groups)), it also shows on the `home` card of each later window, with a 2nd-chance badge. If a window closes with the task not done and a later window is still upcoming, the task shows as "missed, 2nd chance at X", where X is the `home` of the next upcoming window. It's missed for good only when no window is open and none is upcoming.

```yaml
- id: lost-cat
  title: Find the elder's cat
  category: quests
  windows:
    - from: village
    - from: epilogue
      until: end
```

### Exclusive groups

Some tasks can't all be done: pick one reward, and the others vanish. Give each such task the same `exclusive` name. Marking one done makes the others **not-chosen**, and they stop counting as left to do. To switch, the user unchecks the chosen task first.

- `exclusive` is set on tasks, not on sections. Its names have their own namespace.
- Exclusivity is task-level, not window-level. If a member is done in any window, its siblings are not-chosen in every window, and they disappear from any 2nd-chance cards.
- Every exclusive group needs at least 2 tasks (`exclusive-single`).
- Exclusive groups are about tasks within one route. Mutually exclusive routes need separate guides.

## Spoilers

`spoiler: true` hides text that would give something away, at two levels:

- **Section spoiler:** the section's title and overview are blurred while the section is locked. They show normally once it's reached.
- **Task spoiler:** the task's title and `how` are blurred until the user taps them or the task is done.

Spoilers are part of a layered reveal (spec §5.6). Section titles and overviews, task titles, categories and counts are visible by default. `how` and walkthroughs are hidden until tapped or expanded. `spoiler: true` adds a blur on top, wherever the text appears. A tap reveals that one item for the rest of the session. A blurred row still shows that *something* matters here, and in which category, without saying what. Use `spoiler` for story reveals and surprise rewards, not for every task.

## Prose

- **Plain text:** `game`, `title`, `overview`, category `name` and `about`. Markdown in them isn't rendered: `**Sunblade**` shows the asterisks.
- **Markdown:** `walkthrough` and `how` use CommonMark plus GFM tables, strikethrough and autolinks.
- **Raw HTML** is never rendered. It's shown escaped, and validation warns (`md-html`).
- **Images** (`![alt](url)`) aren't rendered in v1. They show as their alt text, and validation warns (`md-image`).
- **Links** are allowed only for `http:`, `https:` and `mailto:`. They open in a new tab.
- **Headings** inside prose are rendered at reduced size so they sit inside a card. In the `.md` container, prose headings must be level 2 or deeper (`##`), because `#` starts a new section. In a `.yaml` guide, a `#` heading inside a block scalar is allowed, but `##` keeps both containers alike.

## YAML rules

- YAML 1.2 core schema, one document only. `yes`, `no`, `on` and `off` are plain strings, not booleans, so `tracked: yes` is a `type` error. Write `true` or `false`.
- **Quoting.** An unquoted value can't contain `: ` (colon, space) or ` #` (space, hash), and can't start with an indicator character (`[`, `]`, `{`, `}`, `#`, `&`, `*`, `!`, `|`, `>`, `'`, `"`, `%`, `@`, a backtick, or `- `, `? ` or `: `). Quote such a value (`title: "Book: A History of the Keep"`), or write it as a `|` block scalar, the usual choice for `how` and `walkthrough`. On the same line as its key, such a value is usually `yaml-syntax`. A ` #` gives no error: it starts a comment, and the rest of the line is silently dropped. A value that is all `[…]` becomes a list, whether it's on the key's line or the line below. A value on the line below its key that contains `: ` becomes a mapping. Neither gives a syntax error: both are `type` errors.
- Duplicate keys are an error (`yaml-syntax`). A duplicated key directly under `categories` is reported as `id-duplicate`.
- Custom tags (`!something`) are an error (`yaml-syntax`).
- Anchors and aliases are allowed, with at most 100 alias expansions. More is `yaml-syntax`.
- UTF-8 only (`encoding`). A byte-order mark is accepted and stripped. Windows (`\r\n`) and old Mac (`\r`) line endings are accepted.

## Validation

The validator returns a list of **issues**, sorted by line and column:

| Field | Meaning |
|---|---|
| `severity` | `error` or `warning`. |
| `code` | A stable code from the tables below. Key on the code, not the message. |
| `message` | A human-readable explanation. The wording may change. |
| `file` | `guide.yaml`, `guide.yml` or `guide.md` (the CLI shows the path you passed), or `null` for `no-root-file`. |
| `line`, `column` | 1-based position in the whole file, or `null` when the issue has no location. |
| `path` | The YAML path, for example `sections[0].sections[1].requires[0]`, `tasks[3].windows[0].home` or `categories.loot.name`. `null` for issues in a `.md` body or without a location. |

- Any **error** rejects the upload. No guide is produced.
- **Warnings** are shown in the report but don't block.

### Phases

The validator works in phases. Some errors stop it before later phases run, because later checks need a sound structure. So fixing one error can reveal others. Keep running the validator until it's clean.

1. **Text:** file name, size and encoding. Any error stops.
2. **Container:** for `.md`, split off the front matter. `md-front-matter` stops.
3. **YAML:** parse the YAML. Errors stop. Then check `sweep`, which also stops.
4. **Structure:** required fields, types, ID formats, lengths and counts. Any error stops.
5. **Identity and references:** duplicate and reserved IDs, references to sections and categories, `requires-empty-any`, exclusive groups and renames. `id-duplicate`, `unknown-section` and `requires-empty-any` stop.
6. **Markdown body** (`.md` only, because it needs the section IDs): `md-heading`, `md-unknown-section`, `md-duplicate-section`, `walkthrough-twice`, `md-preamble`, and `limit` for a body walkthrough over 100,000 characters. None of these stop.
7. **Graph:** `requires-lineage`, then `requires-cycle` (skipped if there's a lineage error).
8. **Windows:** `end-not-last`, `home-not-leaf`, `until-before-from`, `home-outside-window`, `window-order`. They run even when the graph has errors.
9. **Prose warnings:** `md-html` and `md-image` in every `walkthrough` and `how`.

### Errors

| Code | Rule | Points at |
|---|---|---|
| `encoding` | The file isn't valid UTF-8. | The first invalid byte. |
| `too-large` | The file is over 2 MiB. | No location. |
| `no-root-file` | There isn't exactly one `guide.yaml`, `guide.yml` or `guide.md`. | No location. |
| `yaml-syntax` | YAML parse error, multiple documents, duplicate key, custom tag, or alias limit exceeded. | The parse error; the second of two duplicate keys; the value after the custom tag; the start of the second document; the first alias. |
| `md-front-matter` | A `.md` file doesn't start with a closed `---` front-matter block. | Line 1, column 1. |
| `format-version` | `sweep` is missing or isn't `1`, or the YAML is empty or isn't a mapping. | The `sweep` value, or the start of the file's top-level mapping when `sweep` is absent, or the start of the YAML when it's empty or not a mapping. |
| `required` | A required field is missing, a plain-text field is empty, or `categories` is missing or empty while tasks exist. | The start of the mapping that lacks the field; the empty value; for `categories`, the `tasks` value. |
| `type` | A field has the wrong type (including a null or boolean in an ID or reference field, or an ID or reference key with no value), a group's `sections` or a task's `windows` is an empty list, or `requires` is in an unsupported shape. | The field's value. |
| `id-format` | An ID, category ID, exclusive name, `renamed_from` entry, or reference to one isn't a valid slug of 64 characters or fewer. | The offending value (for a category ID, the key). |
| `id-duplicate` | An ID is used twice in the section/task namespace, or a category key is duplicated. | The second (and later) `id` value, or the second category key. |
| `id-reserved` | A section or task uses the ID `end`. | The `id` value. |
| `no-leaves` | The guide has no leaf sections (top-level `sections: []`). | The `sections` value. |
| `unknown-section` | `requires`, `from`, `until` or `home` names a section that doesn't exist. A task ID there is also `unknown-section`, and the message says it's a task. | The unknown ID. |
| `unknown-category` | A task's `category` isn't defined. | The `category` value. |
| `requires-empty-any` | `{any: []}`. | The empty `any` list. |
| `requires-lineage` | A section requires itself, one of its ancestors, or one of its descendants. | The offending ID in `requires`. |
| `requires-cycle` | The dependency graph has a cycle, including default `requires`, group gates and `any` edges. The message reads `requires cycle: a → c → b → a`, following the needs direction. | The `requires` of the first cycle member in route order whose explicit `requires` points into the cycle. |
| `home-not-leaf` | `home` names a group. | The `home` value. |
| `home-outside-window` | `home` isn't within `first(from)` … `last(until)`. | The `home` value. |
| `until-before-from` | `last(until)` < `first(from)`. | The `until` value. |
| `window-order` | Windows overlap or are out of order: `first(windows[i].from)` isn't greater than `last(windows[i-1].until)`. | `windows[i].from`. |
| `end-not-last` | `until: end` appears on a window other than the last. | The `until` value. |
| `exclusive-single` | An exclusive group has fewer than 2 tasks. | The `exclusive` value. |
| `rename-conflict` | A `renamed_from` entry equals any current section or task ID, the element's own ID, or an entry claimed by another element. | The offending entry. |
| `md-heading` | A `.md` level-1 heading isn't a bare section ID. | The heading line, column 1. |
| `md-unknown-section` | A `.md` heading names a section that doesn't exist. | The heading line, column 1. |
| `md-duplicate-section` | The same section heading appears twice. | The later heading line, column 1. |
| `walkthrough-twice` | A section has both an inline `walkthrough` and a body heading. | The heading line, column 1. |
| `limit` | A limit is exceeded: a length from the field reference, or an item in [Limits](#limits). | The value that is too long, the list that has too many entries, the section, task or category that goes over the count, or the `id` of a section nested too deep. For a `.md` body walkthrough, the heading line, column 1. |

### Warnings

| Code | Rule | Points at |
|---|---|---|
| `unknown-key` | An unrecognized field is present. It's ignored. The message suggests the closest known key when the edit distance is 3 or less and smaller than the key's length (for `titel`, it says "did you mean `title`?"), otherwise it lists the known keys (`known keys: id, title, category, windows, how, exclusive, spoiler, renamed_from`). | The key. |
| `unused-category` | A category no task uses. | The category key. |
| `overview-long` | An overview longer than 200 characters, or containing a line break. | The `overview` value. |
| `md-html` | Raw HTML in prose. It will be shown escaped. | The HTML in a `.md` body, or the field's value in YAML. |
| `md-image` | An image in prose. It won't be shown. | The image in a `.md` body, or the field's value in YAML. |
| `md-preamble` | Text before the first `# <section-id>` in a `.md` body. It's ignored. | The first non-blank preamble line, column 1. |

### Structural problems

How common structural mistakes map to codes:

| Situation | Code |
|---|---|
| A required key is absent | `required`, at the mapping that lacks it (a missing `categories` is reported at `tasks`) |
| A plain-text field is `""` | `required` ("must not be empty") |
| A plain-text key with no value (`how:`), which YAML reads as `null` | `type` ("must be text; found an empty value") |
| An ID or reference key with no value (`from:`, or an empty `requires` entry) | `type` ("`from` is empty; give it a section ID") |
| Wrong type, `sections: []` on a group, `windows: []`, an unsupported `requires` shape, a value that isn't one of its allowed literals | `type` |
| Top-level `sections: []` | `no-leaves` |
| A non-string in an ID or reference field, such as an unquoted `true`, `false` or `null` | `type` ("must be a string; YAML read `null` as null, so quote it") |
| An ID or reference that is the empty string `""` | `id-format` |
| A string fails the slug rule or is over 64 characters: IDs, category keys, `category`, `exclusive`, `from`, `until`, `home`, `requires` entries, `renamed_from` entries | `id-format` |
| A string over its maximum length; too many windows, `requires` IDs or `renamed_from` entries; too many sections, tasks or categories; nesting deeper than 5 levels | `limit` |
| An unknown key | warning `unknown-key` ("did you mean `x`?" only when the edit distance is 3 or less and smaller than the key's length, otherwise the list of known keys) |
| An overview over 200 characters or with a line break | warning `overview-long` |

### `sweep validate`

The CLI checks a guide file, for generate → validate → fix loops.

```sh
pnpm sweep validate <file> [--json]
```

- `<file>` is resolved from the directory you ran `pnpm` in. Its extension must be `.yaml`, `.yml` or `.md` (any case).
- `-h` or `--help`, anywhere on the command line, prints usage and exits `0`. Reading from stdin (`-`) isn't supported.

Text output has one line per issue, then a summary:

```text
<file>:<line>:<col> <severity> <code> <message>
<file> <severity> <code> <message>
<n> errors, <m> warnings
```

The second form is for issues without a location. The summary uses the singular for 1 (`1 error, 1 warning`).

For example, take a copy of Lantern Keep with three mistakes: `untill: marsh` on `village-chest` (a misspelled key), `until: throne-rom` on `moonshield` (a typo), and `home: village` on `keep-history`, whose window starts at `act-2`:

```text
guides/my-guide.yaml:75:9 warning unknown-key unknown key `untill` is ignored; did you mean `until`?
guides/my-guide.yaml:112:16 error unknown-section "throne-rom" is not a section ID in this guide
1 error, 1 warning
```

The `home` mistake isn't reported yet: `unknown-section` stops the validator before the window checks (see [Phases](#phases)). Fix the typo and run it again:

```text
guides/my-guide.yaml:75:9 warning unknown-key unknown key `untill` is ignored; did you mean `until`?
guides/my-guide.yaml:96:15 error home-outside-window task keep-history, window 1: home village is outside the window from act-2 to end
1 error, 1 warning
```

The warning matters too: the misspelled `untill` is ignored, so that window silently closes at `village` instead of `marsh`.

`--json` prints one object, indented with 2 spaces. Each issue's `file` is the path you passed. The first run above, with `--json`:

```json
{
  "file": "guides/my-guide.yaml",
  "errors": 1,
  "warnings": 1,
  "issues": [
    {
      "severity": "warning",
      "code": "unknown-key",
      "message": "unknown key `untill` is ignored; did you mean `until`?",
      "file": "guides/my-guide.yaml",
      "line": 75,
      "column": 9,
      "path": "tasks[1].windows[0].untill"
    },
    {
      "severity": "error",
      "code": "unknown-section",
      "message": "\"throne-rom\" is not a section ID in this guide",
      "file": "guides/my-guide.yaml",
      "line": 112,
      "column": 16,
      "path": "tasks[6].windows[0].until"
    }
  ]
}
```

| Exit code | Meaning |
|---|---|
| `0` | No errors (warnings are allowed). |
| `1` | The guide has errors. |
| `2` | Usage error: bad arguments, an unreadable file or an unsupported extension. |

## Limits

| Item | Limit | Code |
|---|---|---|
| File size | 2 MiB (2,097,152 bytes) | `too-large` |
| Sections | 2,000, counting groups | `limit` |
| Tasks | 10,000 | `limit` |
| Categories | 50 | `limit` |
| Nesting depth | 5 levels (top-level sections are level 1) | `limit` |
| Windows per task | 8 | `limit` |
| IDs in one `requires` | 50 | `limit` |
| `renamed_from` entries per element | 20 | `limit` |
| `walkthrough` | 100,000 characters, inline or in a `.md` body section | `limit` |
| `how` | 10,000 characters | `limit` |
| YAML alias expansions | 100 | `yaml-syntax` |

Field lengths from the [Field reference](#field-reference) (`game`, `title`, `overview`, `name`, `about`, IDs) are enforced the same way: over the maximum is `limit`, or `id-format` for IDs.

## Lantern Keep, step by step

*Lantern Keep* is a small fictional game, written to use every part of the format in one short guide. It's the reference example: `guides/examples/lantern-keep.yaml`. It shows:

- default and explicit `requires`, with two towers that can be climbed in either order
- groups without a gate of their own, and what a group gate would add
- a group used as `from`, with a non-default `home`
- a 2nd chance
- `until: end`
- an exclusive pair
- a spoiler section and a spoiler task
- an untracked category

Here is the whole file:

<!-- file: guides/examples/lantern-keep.yaml -->
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

### Sections and route order

There are three top-level sections. `act-1` and `act-2` are groups, shown as headings. `epilogue` has no children, so it's a leaf. The leaves in route order are:

| Position | Leaf | In group |
|---|---|---|
| 0 | `village` | `act-1` |
| 1 | `marsh` | `act-1` |
| 2 | `keep-gate` | `act-2` |
| 3 | `east-tower` | `act-2` |
| 4 | `west-tower` | `act-2` |
| 5 | `throne-room` | `act-2` |
| 6 | `epilogue` | (top level) |

The four categories set the order of tasks within each card: Story, Loot, Side quests, Lore. `lore` has `tracked: false`, so new runs start with Lore hidden (see [Lore is untracked](#lore-is-untracked) below).

### Requires

Only two sections write `requires`. The rest use the default, the previous leaf:

- `village` is the first leaf, so it requires nothing.
- `marsh` requires `village` (default).
- `keep-gate` requires `marsh` (default). The default chains across the group boundary from `act-1` into `act-2`.
- `east-tower` requires `keep-gate` (default).
- `west-tower` has an explicit `requires: [keep-gate]`. Without it, it would default to `east-tower`, and the towers would have to be climbed east first. With it, both towers unlock as soon as `keep-gate` is cleared, and the player can climb them in either order.
- `throne-room` has `requires: [east-tower, west-tower]`, so it waits for both towers, whichever order they were cleared in.
- `epilogue` requires `throne-room` (default).

Neither group writes `requires`. A group's omitted `requires` is `[]`, so `act-1` and `act-2` have no gate: their leaves are held back only by their own `requires`. `act-2` doesn't need a gate, because `keep-gate` already waits for `marsh`. A group gate is for holding back every leaf in the group at once: `requires: [act-1]` on `act-2` would keep all four of its leaves locked until every leaf of Act 1 is cleared, on top of each leaf's own `requires`. The Breath of the Wild pattern [below](#open-world-per-window-home) uses a group gate this way.

`throne-room` also has `spoiler: true`. While it's locked, its title and overview are blurred, so the card doesn't reveal who the player confronts. Once both towers are cleared, it's unlocked and shows normally.

### Tasks and windows

Each task says when it can be done. Sweep works out the rest.

| Task | Windows | Closes when | Card (`home`) |
|---|---|---|---|
| `ferry-passage` | `village` | `village` is cleared | `village` |
| `village-chest` | `village` until `marsh` | `marsh` is cleared | `village` |
| `lost-cat` | `village`; 2nd chance `epilogue` until `end` | `village` is cleared, then never | `village`, then `epilogue` |
| `marsh-herbs` | `marsh` until `end` | never | `marsh` |
| `keep-history` | `act-2` until `end` | never | `east-tower` |
| `sunblade`, `moonshield` | `west-tower` until `throne-room` | `throne-room` is cleared | `west-tower` |
| `keepers-lantern` | `throne-room` | `throne-room` is cleared | `throne-room` |

**`ferry-passage`** has only `from: village`. `until` defaults to `from`, so the window closes when `village` is cleared. It's in the Story category: a main-path step tracked as a task.

**`village-chest`** runs `from: village` `until: marsh`. The village walkthrough says why: "You can row back from the marsh, but not once you reach the keep." So `marsh` is the last leaf where the chest can still be done. Clearing `marsh` is the moment Sweep warns that it closes. `until: keep-gate` would be the classic mistake described in [Windows and home](#windows-and-home).

**`lost-cat`** has two windows. The primary window is `village` only. The second window runs from `epilogue` until `end`. If the user clears `village` without finding the cat, the task becomes **missed, 2nd chance at Epilogue**, rather than missed for good. Because it has a later window, it also shows on the `epilogue` card with a 2nd-chance badge for as long as it's unresolved. When `epilogue` is reached, it's open again, and that window never closes.

**`marsh-herbs`** runs `from: marsh` `until: end`. The task can be done any time after `marsh` is reached, so it's never missed. The marsh walkthrough says where they are.

**`keep-history`** shows three things at once:

- `from: act-2` names a group. The window opens as soon as any leaf in `act-2` is reached. In this guide that's `keep-gate`, because the other three `act-2` leaves all wait on it.
- `home: east-tower` puts the checkbox on the East Tower card. Without `home`, it would sit on `keep-gate`, the first leaf of `act-2`. `east-tower` is within the window, which runs from position 2 to position 6.
- `until: end` means it never closes.

Its title is quoted (`"Book: A History of the Keep"`) because a colon followed by a space would otherwise start a YAML mapping (see [YAML rules](#yaml-rules)).

**`sunblade` and `moonshield`** share `exclusive: armory-reward`: their `how` says that taking one from the armory rack makes the other vanish. Both open when `west-tower` is reached and close when `throne-room` is cleared. Marking one done makes the other not-chosen, and it stops counting as left to do. If neither is done when `throne-room` is cleared, both are missed.

**`keepers-lantern`** has `spoiler: true`. Its title and `how` are blurred until the user taps them or marks the task done. The card still shows that there's something in the Loot category here. With only `from: throne-room`, it closes when `throne-room` is cleared.

### Lore is untracked

`keep-history` is in the Lore category, which has `tracked: false`. New runs start with Lore untracked, so the book is hidden everywhere, including in counts. A user who enables Lore for their run sees it on the East Tower card.

### The same guide as Markdown

`guides/examples/lantern-keep.md` is the same guide in the Markdown container. The front matter is the YAML file without the schema comment and without the two `walkthrough` fields. The walkthroughs move into the body, each under a `# <section-id>` heading. This is the end of the file, from the closing `---` of the front matter:

<!-- from: guides/examples/lantern-keep.md -->
```markdown
---

# village

## Arrival
Talk to the elder, then buy a **lantern** from the shop.

## Leaving
You can row back from the marsh, but not once you reach the keep.

# marsh

Keep to the lit path. The herb patch is north of the second post.
```

Both files produce the same normalized model. Headings inside a walkthrough, like `## Arrival`, are level 2, because a level-1 heading starts the next section.

## Patterns

These patterns cover the common shapes of real games. The first three come with example guides in `guides/examples/`. Those samples are **illustrative**: their windows are simplified to show the mechanics, and they aren't a factual guide to the games. Each one is a complete guide.

The "how it plays out" notes use the app's terms:

- A task is **open** while one of its windows is open, and **upcoming** before any window has opened. It's **missed** when a window has closed without it being done and no window is open now. If a later window is still upcoming, it shows as "missed, 2nd chance at X". Otherwise it's missed for good.
- **Current** is the leaf the user is at: a valid pin (the leaf they pinned with **I'm here**), or else the earliest unlocked leaf they haven't cleared.
- The bottom bar shows four counts. **HERE** is the open tasks whose `home` is the current leaf. **NOW** is all open tasks. **CLOSING** is the tasks that clearing the current leaf would make missed. **LAST CHANCE** is the part of CLOSING with no later window.

### Open world, per-window `home`

Breath of the Wild opens up once you leave the Great Plateau: every region is reachable, in any order, and hundreds of tasks become doable at once. Example: `guides/examples/botw-open-world.yaml`.

The `hyrule` group gates the open world, and each region opts out of the default chain:

<!-- from: guides/examples/botw-open-world.yaml -->
```yaml
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
```

Every Korok is available from `hyrule` to the end of the game, and `home` puts each one on its region's card. The plateau shrine opens at `plateau-shrines` and keeps the default `home`:

<!-- from: guides/examples/botw-open-world.yaml -->
```yaml
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
- Every Korok window opens the moment the plateau is cleared, because `from: hyrule` is reached as soon as any `hyrule` leaf is. Each Korok appears only in its `home` card. Without `home`, all of them would default to `kakariko`, the first leaf of `hyrule`.
- **NOW** counts every open Korok. That's the opt-in "everything doable now" view. **HERE** counts only the current card's.
- Current defaults to `kakariko`, the earliest unlocked leaf. A player heading to Hateno taps **I'm here** on Hateno.
- Nothing ever closes (`until: end`), so CLOSING and LAST CHANCE stay at 0.

### A 2nd chance

In Final Fantasy VIII, a card can be won early in the game, and again much later when the player returns to the same place. The second visit is its own leaf (`garden-return`), and the task spans both visits with two windows. Example: `guides/examples/ff8-second-chance.yaml`. The leaves in route order are `balamb-garden`, `fire-cavern`, `dollet`, `timber`, `deling-city` and `garden-return`.

<!-- from: guides/examples/ff8-second-chance.yaml -->
```yaml
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
- Tapping **Clear section** (the card's button for clearing a leaf) on Dollet shows:
  > Clearing **Dollet** closes 2 open tasks.
  > **Gone for good:** Card from the Dollet pub owner
  > **Closes until later:** Quistis card (2nd chance at Balamb Garden (Disc 3))
- After clearing, `quistis-card` is **missed, 2nd chance at Balamb Garden (Disc 3)**. It shows in red in the Balamb Garden card. It also appears in the `garden-return` card with a "2nd chance" badge, because it's unresolved.
- Once `garden-return` is reached, the task is **open** again (2nd chance). If the user checks it there, it becomes **done**. It then shows as done in Balamb Garden and leaves the `garden-return` card. If the user had checked it on Disc 1, it would never have appeared in `garden-return`.

### An exclusive choice with `spoiler`

In Final Fantasy VI, the player receives one of two relics, depending on a conversation. Both tasks share an exclusive group, and both are spoilers so the card doesn't give the choice away. Example: `guides/examples/ff6-exclusive-relic.yaml`.

<!-- from: guides/examples/ff6-exclusive-relic.yaml -->
```yaml
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

### Recipes

Shorter patterns, without example files.

**A linear chapter.** List the leaves in the order they're played and don't write `requires`: each leaf defaults to requiring the previous one. Give each task a window from the leaf where it becomes available until the last leaf where it can still be done.

**A hub with any-order branches.** Put `requires: [hub]` on the first leaf of each branch, so they all unlock when the hub is cleared. Put `requires: [a, b, c]`, naming every branch, on the section where they converge. If a branch has several leaves, its later leaves keep their default `requires`, and the convergence can name the branch's group.

```yaml
- id: hub
  title: Town square
  overview: Three roads lead out of town.
- id: forest
  title: Forest
  overview: The northern road.
  requires: [hub]
- id: mines
  title: Mines
  overview: The eastern road.
  requires: [hub]
- id: coast
  title: Coast
  overview: The southern road.
  requires: [hub]
- id: capital
  title: Capital
  overview: All three roads end at the capital gates.
  requires: [forest, mines, coast]
```

**Any one of.** When clearing any one of several sections is enough, use `requires: {any: [a, b]}`. The section unlocks when at least one of them is cleared. Use it for sections the player visits anyway, where either one is enough to go on: for example, the vault key can be found in the crypt or in the bell tower. Give each option its own explicit `requires`, so one doesn't default to the other. Without `requires: [courtyard]` on `tower`, it would default to requiring `crypt`, and the `any` would add nothing.

```yaml
- id: courtyard
  title: Courtyard
  overview: A crypt and a bell tower open off the courtyard.
- id: crypt
  title: Crypt
  overview: Search the tombs below the chapel.
  requires: [courtyard]
- id: tower
  title: Bell tower
  overview: Climb to the belfry.
  requires: [courtyard]
- id: vault
  title: Vault
  overview: Open the vault with the key.
  requires: {any: [crypt, tower]}
```

**A revisit.** Give a second visit to a place its own leaf with its own ID, such as `balamb-garden-d1` and `balamb-garden-d3`. A task that can be done on either visit gets one window per visit.

**Doable until the end of the game.** Use `until: end` on the task's last window. It never closes and is never missed. Use it only when nothing in the game makes the task unavailable.

## Authoring tips

### For humans

- **Use `.yaml` with the schema comment** as the first line, so your editor gives you autocomplete and inline errors.
- **Write the sections first, then the tasks.** Get the route and its `requires` right before adding windows: every window names sections.
- **Validate often.** Run `pnpm sweep validate` after each batch of changes, not only at the end. Fixing one error can reveal others.
- **Keep overviews to one sentence.** Detail belongs in the walkthrough, and task instructions belong in `how`.

### For LLMs

Converting an existing walkthrough into a guide? Follow these rules. The skill at [`.claude/skills/write-sweep-guide/SKILL.md`](../.claude/skills/write-sweep-guide/SKILL.md) walks through the whole conversion.

1. **Read this document first. Never guess a field.** An unknown key is only a warning (`unknown-key`) and is ignored, so a guessed field silently does nothing.
2. **Categories describe what a task is, never whether it's missable.** No "Missables" category. Missability comes from windows.
3. **Write `requires` only where progression isn't "the previous leaf".** The default already chains leaves in route order.
4. **`until` is the last leaf where the task can still be done.** Infer closures from facts the source states: a point of no return, an area that becomes unreachable, a disc or chapter ending, or a character leaving the party. Set `until` to the last leaf before that point, and cite the source sentence in your conversion report. Use `until: end` only when the source gives no sign that the task or area becomes unavailable. Never invent a closure the source doesn't support.
5. **Set `home`** for any task that should show on a card other than the first leaf of `from`, especially when `from` is a group.
6. **Plain-text fields have no Markdown.** `game`, `title`, `overview`, category `name` and `about` show asterisks and brackets literally. In a `.md` guide, headings inside a walkthrough are `##` or deeper, because `#` starts a new section.
7. **Never invent facts.** Every section, task, reward and closure must come from the source. If the source doesn't say, leave it out.
8. **Loop on `pnpm sweep validate` until it's clean.** Read the codes, not just the messages: the code says which rule failed, and the [Validation](#validation) tables say what each code means and where it points. Use `--json` to read issues by `code` and `path`.
9. **Prefer `.md` for long walkthroughs.** The prose stays readable and out of YAML indentation.
10. **Omitting `until` is a closure claim.** It means the task can be done only in `from`. Decide every window's `until`: the last leaf before a closure the source states, the leaf of a one-time event, or `end`.
11. **End a leaf at every point of no return.** Sweep warns when a leaf is cleared. If the irreversible step falls mid-section, split the section so the last-chance leaf is cleared before it.
12. **Keep visible text spoiler-light.** Section titles and overviews, task titles and category text show before the player gets there. Never name a future plot event in them: put it in a walkthrough or `how`, or mark it `spoiler: true`.
