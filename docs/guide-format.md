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

   A well-formed heading that names no section is `md-unknown-section`.
4. **Once each.** A section ID may appear as a heading at most once (`md-duplicate-section`). A section with a body heading must not also have an inline `walkthrough` in the front matter (`walkthrough-twice`).
5. **Walkthrough text.** The text after a heading, up to the next split point, is that section's walkthrough. Leading blank lines and trailing whitespace are trimmed. Headings inside it must be level 2 or deeper.
6. **Preamble.** Non-blank text between the front matter and the first heading is ignored and gives the warning `md-preamble`.

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

IDs start with a letter so YAML never reads them as numbers. The slugs `true`, `false` and `null` are still read by YAML as a boolean or null, and fail validation. Pick another ID, or quote it (`id: "true"`).

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
| `exclusive` | slug | no | none | Exclusive-group name. Every group needs at least 2 tasks. |
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

- **Plain-text scalars.** In the plain-text fields (`game`, `title`, `overview`, category `name` and `about`) and in `walkthrough` and `how`, a value YAML reads as a number or boolean is kept as you wrote it: `game: 1942` becomes the text `"1942"`. Other fields aren't converted: `spoiler: "true"` is a `type` error.
- **Empty text.** A plain-text field set to `""` is a `required` error ("must not be empty"). A `walkthrough` or `how` that is empty after trimming counts as absent.
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

## Windows and home

A task has 1–8 **windows**. Each one is a range of the game in which the task can be done: `{from, until, home}`.

- **A window opens when `from` is reached.** A leaf is reached when it's unlocked or cleared. A group is reached as soon as any leaf in it is reached.
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

**Why `home` exists:** in Breath of the Wild, hundreds of tasks become doable the moment you leave the Great Plateau. With `from: hyrule` and no `home`, all of them would land on the first open-world card. Setting `home` per window puts each task on the card of the region where it's actually done, while `from` and `until` still say when it's available. Tasks that are open anywhere show up in the NOW sheet regardless of `home`.

- `home` must be a leaf (`home-not-leaf`).
- `home` must be within the window, from `first(from)` to `last(until)` inclusive (`home-outside-window`).

### Ordering rules

- `until` can't come before `from`: `last(until)` < `first(from)` is `until-before-from`.
- Windows are listed in route order and don't overlap. For each window after the first, `first(windows[i].from)` must be greater than `last(windows[i-1].until)`. Otherwise it's `window-order`. Two windows can't share a leaf.
- Only the last window may be `until: end` (`end-not-last`).

### 2nd chances

The first window is the **primary window**. Every later window is a **2nd chance**. The task always shows on the `home` card of its primary window. While it's unresolved, it also shows on the `home` card of each later window, with a 2nd-chance badge. If a window closes with the task not done and a later window is still upcoming, the task shows as "missed, 2nd chance at X", where X is the `home` of the next upcoming window. It's missed for good only when no window is open and none is upcoming.

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
| `path` | The YAML path, for example `sections[0].sections[1].requires[0]`, `tasks[3].windows[0].home` or `categories.loot.name`. `null` for issues in a `.md` body. |

- Any **error** rejects the upload. No guide is produced.
- **Warnings** are shown in the report but don't block.

### Phases

The validator works in phases. Some errors stop it before later phases run, because later checks need a sound structure. So fixing one error can reveal others. Keep running the validator until it's clean.

1. **Text:** file name, size and encoding. Any error stops.
2. **Container:** for `.md`, split off the front matter. `md-front-matter` stops.
3. **YAML:** parse the YAML. Errors stop. Then check `sweep`, which also stops.
4. **Structure:** required fields, types, ID formats, lengths and counts. Any error stops.
5. **Identity and references:** duplicate and reserved IDs, references to sections and categories, `requires-empty-any`, exclusive groups and renames. `id-duplicate`, `unknown-section` and `requires-empty-any` stop.
6. **Graph:** `requires-lineage`, then `requires-cycle` (skipped if there's a lineage error).
7. **Windows:** `end-not-last`, `home-not-leaf`, `until-before-from`, `home-outside-window`, `window-order`.
8. **Markdown body** (`.md` only, once the structure phase has passed, because it needs the section IDs): `md-heading`, `md-unknown-section`, `md-duplicate-section`, `walkthrough-twice` and `md-preamble`.
9. **Prose warnings:** `md-html` and `md-image` in every `walkthrough` and `how`.

### Errors

| Code | Rule | Points at |
|---|---|---|
| `encoding` | The file isn't valid UTF-8. | The first invalid byte. |
| `too-large` | The file is over 2 MiB. | No location. |
| `no-root-file` | There isn't exactly one `guide.yaml`, `guide.yml` or `guide.md`. | No location. |
| `yaml-syntax` | YAML parse error, multiple documents, duplicate key, custom tag, or alias limit exceeded. | The parse error; the second of two duplicate keys; the tagged node; the start of the second document; the first alias. |
| `md-front-matter` | A `.md` file doesn't start with a closed `---` front-matter block. | Line 1, column 1. |
| `format-version` | `sweep` is missing or isn't `1`. | The `sweep` value, or the start of the file's top-level mapping when `sweep` is absent. |
| `required` | A required field is missing, a plain-text field is empty, or `categories` is missing while tasks exist. | The start of the mapping that lacks the field. |
| `type` | A field has the wrong type, a group's `sections` or a task's `windows` is an empty list, or `requires` is in an unsupported shape. | The field's value. |
| `id-format` | An ID, category ID, exclusive name, `renamed_from` entry, or reference to one isn't a valid slug of 64 characters or fewer. | The offending value. |
| `id-duplicate` | An ID is used twice in the section/task namespace, or a category key is duplicated. | The second (and later) `id` value, or the second category key. |
| `id-reserved` | A section or task uses the ID `end`. | The `id` value. |
| `no-leaves` | The guide has no leaf sections (top-level `sections: []`). | The `sections` value. |
| `unknown-section` | `requires`, `from`, `until` or `home` names a section that doesn't exist. | The unknown ID. |
| `unknown-category` | A task's `category` isn't defined. | The `category` value. |
| `requires-empty-any` | `{any: []}`. | The empty `any` list. |
| `requires-lineage` | A section requires itself, one of its ancestors, or one of its descendants. | The offending ID in `requires`. |
| `requires-cycle` | The dependency graph has a cycle, including default `requires`, group gates and `any` edges. | The `requires` of the first section in route order on the cycle that has an explicit `requires`. |
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
| `limit` | A limit is exceeded: a length from the field reference, or an item in [Limits](#limits). | The value that is too long, or the item that goes over the count or depth. |

### Warnings

| Code | Rule | Points at |
|---|---|---|
| `unknown-key` | An unrecognized field is present. It's ignored, and the message suggests the closest known key. | The key. |
| `unused-category` | A category no task uses. | The category key. |
| `overview-long` | An overview longer than 200 characters, or containing a line break. | The `overview` value. |
| `md-html` | Raw HTML in prose. It will be shown escaped. | The HTML in a `.md` body, or the field's value in YAML. |
| `md-image` | An image in prose. It won't be shown. | The image in a `.md` body, or the field's value in YAML. |
| `md-preamble` | Text before the first `# <section-id>` in a `.md` body. It's ignored. | The first non-blank preamble line, column 1. |

### Structural problems

How common structural mistakes map to codes:

| Situation | Code |
|---|---|
| A required key is absent | `required`, at the mapping that lacks it |
| A plain-text field is `""` | `required` ("must not be empty") |
| Wrong type, `sections: []` on a group, `windows: []`, an unsupported `requires` shape, a value that isn't one of its allowed literals | `type` |
| Top-level `sections: []` | `no-leaves` |
| A string fails the slug rule or is over 64 characters: IDs, category keys, `category`, `exclusive`, `from`, `until`, `home`, `requires` entries, `renamed_from` entries | `id-format` |
| A string over its maximum length; too many windows, `requires` IDs or `renamed_from` entries; too many sections, tasks or categories; nesting deeper than 5 levels | `limit` |
| An unknown key | warning `unknown-key` ("did you mean `x`?" for a close match, otherwise the list of known keys) |
| An overview over 200 characters or with a line break | warning `overview-long` |

### `sweep validate`

The CLI checks a guide file, for generate → validate → fix loops.

```sh
pnpm sweep validate <file> [--json]
```

- `<file>` is resolved from the directory you ran `pnpm` in. Its extension must be `.yaml`, `.yml` or `.md` (any case).
- `-h` or `--help` prints usage. Reading from stdin (`-`) isn't supported.

Text output has one line per issue, then a summary:

```text
<file>:<line>:<col> <severity> <code> <message>
<file> <severity> <code> <message>
<n> errors, <m> warnings
```

The second form is for issues without a location. The summary uses the singular for 1 (`1 error, 1 warning`). For example (illustrative; message wording isn't final):

```text
guides/my-guide.yaml:48:15 error unknown-section until names section "keep-gat", which doesn't exist
guides/my-guide.yaml:12:5 warning unknown-key unknown key "overveiw"; did you mean "overview"?
1 error, 1 warning
```

`--json` prints one object, indented with 2 spaces. Each issue's `file` is the path you passed:

```json
{
  "file": "guides/my-guide.yaml",
  "errors": 1,
  "warnings": 1,
  "issues": [
    {
      "severity": "error",
      "code": "unknown-section",
      "message": "…",
      "file": "guides/my-guide.yaml",
      "line": 48,
      "column": 15,
      "path": "tasks[3].windows[0].until"
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
| `walkthrough` | 100,000 characters | `limit` |
| `how` | 10,000 characters | `limit` |
| YAML alias expansions | 100 | `yaml-syntax` |

Field lengths from the [Field reference](#field-reference) (`game`, `title`, `overview`, `name`, `about`, IDs) are enforced the same way: over the maximum is `limit`, or `id-format` for IDs.

## Lantern Keep, step by step

Written in Task 3.

## Patterns

Written in Task 3.

## Authoring tips

Written in Task 3.
