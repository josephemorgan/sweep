# Session B: guide format doc, skill, examples — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the authoritative guide-format doc, ship the spec's example guides as validated files, and turn the `write-sweep-guide` skill into a tested procedure with a validate loop.

**Architecture:** Mostly prose and data. Two root repo tests (`test/`, Vitest) keep the doc tied to the code: the doc's code tables must equal core's `ErrorCode`/`WarningCode`, and every example block embedded in the doc must match the file in `guides/examples/`. After session A's validator lands, a third test checks that each `.yaml`/`.md` example pair parses to deep-equal models. The skill follows superpowers:writing-skills (baseline run → write → trial run).

**Tech Stack:** Markdown, YAML, Vitest 5 (root `test/`), `@sweep/core/parse` (built `dist/`), `pnpm sweep validate`.

**Spec:** `docs/superpowers/specs/2026-09-28-sweep-design.md` §3 (all), §8 (examples), §9 (guide-format.md, `sweep validate`, skill). Session A's binding gap-fillers: `git show worktree-session-a-core:docs/superpowers/plans/2026-09-29-core.md`, section "Design decisions" (lines 41–148): phases, code mapping, issue locations, normalization, markdown body, CLI output.

## Global Constraints

- Work only in `/home/joe/dev/sweep/.claude/worktrees/session-b-format` on branch `worktree-session-b-format`. Never touch another session's worktree. Never commit to master, push to master or merge. Don't merge A's branch; rebase onto a commit the orchestrator names.
- B owns: `docs/guide-format.md`, `guides/examples/**` (including `README.md`), `.claude/skills/write-sweep-guide/**`, and the new `test/guide-format.test.ts` / `test/examples.test.ts`. A owns `ci.yml`, `scripts/validate-examples.sh`, `pnpm validate:examples`, `pnpm schema`, `packages/core/**`.
- Every `.yaml`/`.yml`/`.md` under `guides/examples/` except `README.md` must be a valid guide (A's `validate:examples` runs `pnpm sweep validate` on each).
- `guides/` and Markdown are never auto-formatted (`.prettierignore`); keep exact bytes.
- Glossary terms from `CLAUDE.md` are used verbatim in the doc and skill (guide, run, section, group, leaf, route order, requires, gate, window, home, clear, current, pin, category, tracked, exclusive group, task states, 2nd chance…).
- Validation codes: all 29 error and 6 warning codes from §3.6, unchanged. Issue locations are 1-based line/column. CLI line format: `<file>:<line>:<col> <severity> <code> <message>`; exit 0 (no errors) / 1 (errors) / 2 (usage).
- Upload names: `guideFileName(uploadName)` maps `.yaml`, `.yml`, `.md` (case-insensitive) to `guide.yaml`, `guide.yml`, `guide.md`; anything else is rejected.
- YAML examples start with `# yaml-language-server: $schema=../../schema/sweep-guide.v1.schema.json`.
- Until A's Task 12 lands, don't quote validator message wording as final; codes and locations are final.
- Conventional commits; end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Before committing: `pnpm lint && pnpm typecheck && pnpm test`.
- Spec §3 ambiguities go to the orchestrator ("Sweep Setup"), not silently resolved.

## Review Focus

1. **An LLM puts `# Heading` inside a `.md` walkthrough, or Markdown in a plain-text field.** The doc and skill must state the level-2-or-deeper rule and the plain-text fields explicitly, with the exact `md-heading` consequence. Pinned in Task 3 (doc checklist) and Task 5 (skill checklist).
2. **An author treats route order as availability** (open worlds, hubs, any-order towers). The doc must explain that `requires` decides unlocks and route order only orders display, with the Lantern Keep towers and BotW regions as the worked cases. Pinned in Task 3.
3. **An off-by-one `until`.** Authors will name the section *after* the last chance. The doc and skill must say that `until` is the last leaf where the task is still doable (it closes when that leaf is cleared). Pinned in Task 3 and in Task 7's trial review.
4. **The source walkthrough is silent about whether something is missable.** Claiming a closure invents a fact. The skill must say: when the source doesn't say a task closes, use `until: end` and list the assumption in the conversion report. Pinned in Task 5 and checked in Task 7.
5. **Examples drift** from the doc (embedded blocks) or between containers (`.yaml` vs `.md`). Pinned by `test/guide-format.test.ts` (Task 2) and `test/examples.test.ts` (Task 6).

---

## Phase 1 — no dependency on A's validator

### Task 1: Example guides from the spec

**Files:**
- Create: `guides/examples/lantern-keep.yaml` (spec §3.8a, verbatim)
- Create: `guides/examples/lantern-keep.md` (spec §3.8b, verbatim)
- Create: `guides/examples/botw-open-world.yaml` (spec §3.9.1, plus the schema comment line)
- Create: `guides/examples/ff8-second-chance.yaml` (spec §3.9.2, plus the schema comment line)
- Create: `guides/examples/ff6-exclusive-relic.yaml` (spec §3.9.3, plus the schema comment line)
- Modify: `guides/examples/README.md`

**Interfaces:** Produces the five file paths above; Tasks 2, 3, 6 and 7 use them.

- [ ] **Step 1: Extract.** Write a throwaway script in `$CLAUDE_JOB_DIR/tmp` that reads the spec and writes the content of each fenced block (between the opening ```` ```yaml ````/```` ```markdown ```` line and its closing fence; spec line ranges: 3.8a 314–434, 3.8b 446–571, 3.9.1 579–650, 3.9.2 662–716, 3.9.3 731–770; confirm each range by its fence lines before using it) to its file, ending with exactly one `\n`. For the three §3.9 files, prepend `# yaml-language-server: $schema=../../schema/sweep-guide.v1.schema.json\n` unless the block already starts with it.
- [ ] **Step 2: Verify bytes.** For each file, `diff <(sed -n '<start+1>,<end-1>p' spec) <file minus any added comment line>` prints nothing. `file guides/examples/*` reports ASCII/UTF-8 text with LF line endings; no BOM; no tabs in YAML (`grep -P '\t'` finds nothing).
- [ ] **Step 3: README.** Replace the "Session B adds" list in `guides/examples/README.md` with a table: file, what it demonstrates (from §3.8's bullet list and the §3.9 headings), source section of the spec. Keep the rule "every `.yaml`/`.yml`/`.md` here except this README must pass `pnpm sweep validate`; CI runs `pnpm validate:examples`". Note that the §3.9 samples are illustrative, not factual guides to those games.
- [ ] **Step 4: Commit.** `git add guides/examples && git commit -m "docs(examples): add Lantern Keep and the spec §3.9 sample guides"`.

### Task 2: Doc reference half, with a code-table drift test

**Files:**
- Create: `test/guide-format.test.ts`
- Modify: `docs/guide-format.md` (replace the stub)

**Interfaces:**
- Consumes: `ErrorCode`, `WarningCode` from `@sweep/core/parse` (built `packages/core/dist`; `pnpm test` builds core first). The root package already depends on `@sweep/core` (`workspace:*`).
- Produces: doc conventions Task 3 and the test rely on:
  - Headings `### Errors` and `### Warnings` under `## Validation`, each followed by a table whose first column is a backticked code.
  - `<!-- file: guides/examples/<name> -->` on the line directly before a fenced block means the block's content equals that file exactly. `<!-- from: guides/examples/<name> -->` means the block's content is a contiguous substring of that file.

- [ ] **Step 1: Write the failing test.**

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ErrorCode, WarningCode } from '@sweep/core/parse';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(repoRoot + path, 'utf8');
const doc = read('docs/guide-format.md');

/** Backticked codes in the first column of the table under `### <heading>`. */
function codesUnder(heading: string): string[] {
  const start = doc.indexOf(`\n### ${heading}\n`);
  if (start < 0) throw new Error(`missing "### ${heading}" in docs/guide-format.md`);
  const rest = doc.slice(start + heading.length + 6);
  const end = rest.search(/\n#{1,3} /);
  const section = end < 0 ? rest : rest.slice(0, end);
  return [...section.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]!);
}

/** Fenced blocks preceded by `<!-- file: … -->` or `<!-- from: … -->`. */
function markedBlocks(): { kind: 'file' | 'from'; path: string; body: string }[] {
  const re = /^<!-- (file|from): (\S+) -->\n(`{3,})[^\n]*\n([\s\S]*?)^\3\s*$/gm;
  return [...doc.matchAll(re)].map((m) => ({
    kind: m[1] as 'file' | 'from',
    path: m[2]!,
    body: m[4]!,
  }));
}

describe('docs/guide-format.md stays in sync with core (spec §9)', () => {
  it('lists exactly the error codes core defines', () => {
    expect(codesUnder('Errors').sort()).toEqual(Object.values(ErrorCode).sort());
  });

  it('lists exactly the warning codes core defines', () => {
    expect(codesUnder('Warnings').sort()).toEqual(Object.values(WarningCode).sort());
  });

  it('embeds example guides byte-for-byte', () => {
    for (const block of markedBlocks()) {
      const file = read(block.path);
      if (block.kind === 'file') expect(block.body, block.path).toBe(file);
      else expect(file.includes(block.body), `${block.path} contains the excerpt`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it.** `pnpm build:core && pnpm test:repo -- test/guide-format.test.ts`. Expected: the two code tests FAIL ("missing \"### Errors\""); the embed test passes vacuously.
- [ ] **Step 3: Write the reference half of `docs/guide-format.md`** (opus). Sources: spec §3.1–3.7 and §9, plus A's Design decisions (read with `git show`). Structure, in order:
  1. Title, one-paragraph intro, status line ("This document and the `@sweep/core` validator are co-authoritative (spec §9). Change one, update the other, and regenerate `schema/` with `pnpm schema`."), and a "Quick start" of 10–15 lines (smallest valid guide in YAML) with the validate command.
  2. `## Concepts`: containment tree vs progression DAG; route order (display and "next" only); missable is computed from windows; one guide per route; revisits are new leaves (Balamb Garden Disc 1 vs Disc 3).
  3. `## Containers`: the table; single file; `guideFileName` accepted names; recommendation (.yaml for hand authoring with the schema comment, .md for LLM output and long prose); the six Markdown container rules, with A's precise front-matter regex (`^---[ \t]*$`) and heading rule (root-level `# <id>` only; setext, indented, list or blockquote level-1 headings are `md-heading`).
  4. `## IDs`: slug regex, 64-char limit, three namespaces, reserved `end`, flat and bare (never paths).
  5. `## Field reference`: Top level, Category, Section, Task, Window tables (from §3.3, with defaults); `first(s)`/`last(s)` definitions; plain-text scalars (`game: 1942` becomes `"1942"`).
  6. `## Requires`: the forms, defaults, group gates, "group counts as cleared when all its leaves are cleared", no mixing, `requires-lineage` and `requires-cycle` explained with one-line examples.
  7. `## Windows and home`: opens when `from` is reached, closes when `until` is cleared (event-based, why); `until` default and `end`; **"`until` is the last leaf where the task can still be done"** with a wrong/right pair; `home` default and why (BotW problem); ordering rules; 2nd chances; exclusive groups (task-level).
  8. `## Spoilers`: section spoiler (title and overview of a locked section) and task spoiler (title and `how`), layered reveal (spec §5.6, one paragraph).
  9. `## Prose`: plain-text vs Markdown fields; CommonMark + GFM; HTML escaped (`md-html`); images not rendered (`md-image`); link schemes; headings level 2+ in `.md`.
  10. `## YAML rules`: §3.5.
  11. `## Validation`: issue shape; errors block, warnings don't; phases (A's list, summarized: why fixing one error can reveal others); `### Errors` and `### Warnings` tables (every §3.6 code: code, rule, where the issue points, from A's "Issue locations"); `### Structural problems` (A's mapping table); `### sweep validate` (usage, output line format, `--json` shape, exit codes, file resolved from the directory you ran `pnpm` in).
  12. `## Limits`: §3.7 table.
  Leave `## Lantern Keep, step by step`, `## Patterns` and `## Authoring tips` as headings with a one-line "Written in Task 3." so Task 3 can fill them.
- [ ] **Step 4: Run it.** `pnpm test:repo -- test/guide-format.test.ts`. Expected: PASS (3 tests).
- [ ] **Step 5: Self-check against the spec.** Every §3.3 field and default, every §3.6 code, every §3.7 limit and every Markdown container rule appears in the doc (grep each). Glossary terms are used as defined. Anything in §3 that is ambiguous or contradicts A's decisions is listed in the report for the orchestrator, not resolved.
- [ ] **Step 6: Commit.** `pnpm lint && pnpm typecheck && pnpm test`, then `git commit -m "docs: write the guide format reference and test it against core's issue codes"`.

### Task 3: Doc walkthrough, patterns and authoring tips

**Files:**
- Modify: `docs/guide-format.md` (fill the three sections left by Task 2)
- Modify: `CLAUDE.md` (Docs: "Guide format (authoritative once written)" → "Guide format (authoritative, with the validator)")

**Interfaces:** Consumes Task 1's example files and Task 2's `<!-- file: -->`/`<!-- from: -->` markers.

- [ ] **Step 1: Lantern Keep, step by step.** Embed `guides/examples/lantern-keep.yaml` in full under `<!-- file: guides/examples/lantern-keep.yaml -->` (a ```` ```yaml ```` fence). Then walk it top to bottom, using the §3.8 "What the engine derives" bullets: route order of leaves, each `requires` (default vs explicit, any-order towers, group gate on `act-2`), each task's windows (`village-chest`, `lost-cat` 2nd chance, `sunblade`/`moonshield` exclusive, `ferry-passage`, `keepers-lantern` spoiler, `marsh-herbs` and `keep-history` `until: end`, `keep-history` `from: act-2` + `home: east-tower`), untracked Lore. Then show the `.md` container with a `<!-- from: guides/examples/lantern-keep.md -->` excerpt (the closing `---` of the front matter through the `# marsh` walkthrough) and state that both files produce the same model.
- [ ] **Step 2: Patterns.** One subsection per pattern, each with a `<!-- from: guides/examples/<file> -->` excerpt and the "how it plays out" bullets from spec §3.9: open world with per-window `home` (BotW), 2nd chance (FF8), exclusive choice with `spoiler` (FF6). Add short recipes without excerpts: linear chapter; hub with any-order branches (`requires: [hub]` on each branch, `requires: [a, b, c]` on the convergence); "any one of" (`{any: [...]}`); a revisit as a new leaf; a task doable until the end of the game.
- [ ] **Step 3: Authoring tips.** Two lists. *For humans:* use `.yaml` with the schema comment; write sections first, then tasks; validate often; keep overviews to one sentence. *For LLMs:* (1) read this doc, never guess a field; (2) categories describe what, never missability; (3) `requires` only where progression isn't "the previous leaf"; (4) `until` = last leaf where still doable, `until: end` when the source doesn't say it closes; (5) `home` for anything that should show somewhere other than the first leaf of `from`; (6) plain-text fields have no Markdown; `.md` walkthrough headings are `##`+; (7) never invent facts; (8) loop on `pnpm sweep validate` until it's clean; read codes, not just messages; (9) prefer `.md` for long walkthroughs. Link the skill.
- [ ] **Step 4: Run tests.** `pnpm test:repo -- test/guide-format.test.ts`: PASS. Temporarily change one character of `guides/examples/lantern-keep.yaml` and confirm the embed test FAILS, then restore it (`git diff --exit-code guides/`).
- [ ] **Step 5: Read-through.** The doc reads top to bottom for a newcomer: every term is defined before use, every code in the tables is explained somewhere, and no section says "Written in Task 3".
- [ ] **Step 6: Commit.** `pnpm lint && pnpm typecheck && pnpm test`, then `git commit -m "docs: add the Lantern Keep walkthrough, patterns and authoring tips to the guide format"`.

### Task 4: Skill baseline (RED)

**Files:**
- Create (not committed): `$CLAUDE_JOB_DIR/tmp/skill-trial/excerpt.md`, `baseline-guide.*`, `baseline-notes.md`

- [ ] **Step 1: Pick the excerpt.** Use a CC BY-SA walkthrough (StrategyWiki) for a linear game with documented missables, about 1,500–4,000 words covering 4–8 areas. Save the excerpt text and its URL and license line to `excerpt.md`. Excerpts stay out of the repo.
- [ ] **Step 2: Baseline run.** A fresh sonnet subagent gets only: the stub `SKILL.md` (as on master), `docs/guide-format.md` (from Task 3), and `excerpt.md`, and the instruction "Convert this walkthrough excerpt into a Sweep guide". It must not read the spec or this plan.
- [ ] **Step 3: Review.** Compare the output with the excerpt. Record in `baseline-notes.md`, verbatim where possible: invented facts; wrong `until` (off-by-one or claimed closures the source doesn't state); missing or pointless `home`; categories that encode missability; `requires` that restate the default or miss a real branch; Markdown in plain-text fields; `#` headings in `.md` walkthroughs; spoilers missed or overused; any schema-level mistakes (checked by hand against the doc, since the validator isn't ready).

### Task 5: Write the skill

**Files:**
- Modify: `.claude/skills/write-sweep-guide/SKILL.md`

**Interfaces:** Consumes `baseline-notes.md` (Task 4) and `docs/guide-format.md`.

- [ ] **Step 1: Write `SKILL.md`** (opus, following superpowers:writing-skills). Keep the frontmatter `name` and `description` (the description says *when* to use it, not what it does). Under about 200 lines, with the doc as the reference it points to rather than copies. Sections:
  1. Overview: what a Sweep guide is in two sentences; `docs/guide-format.md` is authoritative; examples in `guides/examples/`.
  2. Inputs to confirm: the source walkthrough, the container (`.md` default for conversions), the output path, the scope (which part of the game).
  3. Procedure: (a) read the doc; (b) inventory the source: areas in order, branch and hub points, points of no return, every collectible or optional task with where it's available and when the source says it's lost; (c) categories; (d) section tree in route order, revisits as new leaves, `requires` only where it differs from the default; (e) tasks with deliberate windows (`from`, `until` = last leaf still doable, `until: end` when the source is silent, `home`), exclusive groups, 2nd chances; (f) spoilers; (g) walkthrough prose (plain-text vs Markdown fields, `##`+ headings in `.md`); (h) validate loop; (i) the conversion report.
  4. Validate loop: `pnpm sweep validate <file>` (or `--json`), fix errors first, then warnings; a table of the most common codes and their usual fix (`unknown-section`, `requires-cycle`, `home-outside-window`, `until-before-from`, `window-order`, `md-heading`, `walkthrough-twice`, `unknown-key`, `overview-long`); stop only on 0 errors, and explain any remaining warning in the report.
  5. Fidelity rules: never invent a fact; leave a task out rather than guess; record assumptions (for example "source doesn't say X closes → `until: end`").
  6. Conversion report template: counts (sections, leaves, tasks per category), assumptions, tasks left out and why, remaining warnings.
  7. Red flags: a table of rationalizations from `baseline-notes.md` with the correction.
- [ ] **Step 2: Check.** Every baseline failure in `baseline-notes.md` is addressed by a specific line in the skill. Every field or code the skill names exists in the doc.
- [ ] **Step 3: Commit.** `git commit -m "docs(skill): expand write-sweep-guide into a full procedure with a validate loop"`.

> **Compaction point:** end of Phase 1. The plan, the branch and `$CLAUDE_JOB_DIR/tmp/skill-trial/` hold everything Phase 2 needs.

---

## Phase 2 — blocked on A (all §3.6 codes live: A's Task 12; real CLI output: A's Task 20)

### Task 6: Validate the examples and test container equivalence

**Files:**
- Create: `test/examples.test.ts`
- Modify (only if the validator disagrees): `guides/examples/*`, `docs/guide-format.md`

**Interfaces:** Consumes `parseGuide(files: Record<string, string | Uint8Array>): ParseResult` and `guideFileName(name)` from `@sweep/core/parse` at the A commit the orchestrator names.

- [ ] **Step 1: Rebase** onto the named A commit: `git rebase <sha>`. Run `pnpm install && pnpm build:core`.
- [ ] **Step 2: Write the test.**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { guideFileName, parseGuide } from '@sweep/core/parse';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('../guides/examples/', import.meta.url));
const guides = readdirSync(dir).filter((f) => f !== 'README.md' && guideFileName(f) !== null);

function parse(name: string): ReturnType<typeof parseGuide> {
  return parseGuide({ [guideFileName(name)!]: readFileSync(dir + name, 'utf8') });
}

describe('guides/examples (spec §8)', () => {
  it('has examples', () => expect(guides.length).toBeGreaterThanOrEqual(5));

  it.each(guides)('%s has no issues', (name) => {
    expect(parse(name).issues).toEqual([]);
  });

  const stems = [...new Set(guides.map((f) => f.replace(/\.[^.]+$/, '')))];
  const pairs = stems.filter((s) => guides.includes(`${s}.md`) && guides.some((f) => /\.ya?ml$/.test(f) && f.startsWith(`${s}.`)));
  it.each(pairs)('%s: .yaml and .md produce the same model', (stem) => {
    const yamlName = guides.find((f) => f === `${stem}.yaml` || f === `${stem}.yml`)!;
    expect(parse(`${stem}.md`).guide).toEqual(parse(yamlName).guide);
  });
});
```

- [ ] **Step 3: Run.** `pnpm test:repo -- test/examples.test.ts` and `pnpm validate:examples`. Expected: PASS and exit 0. If anything fails, report it: a spec example that A's validator rejects is a spec/validator disagreement for the orchestrator, not something to patch silently in the example.
- [ ] **Step 4: Sync the doc with the real validator.** Replace any provisional wording with real `sweep validate` output: run it on a deliberately broken copy of Lantern Keep in `$CLAUDE_JOB_DIR/tmp` (one `unknown-section`, one `home-outside-window`, one `unknown-key`) and paste the actual lines into the doc's `### sweep validate` section.
- [ ] **Step 5: Commit.** `pnpm lint && pnpm typecheck && pnpm test`, then `git commit -m "test: validate example guides and check container equivalence"`.

### Task 7: Skill trial on the real excerpt (GREEN, then REFACTOR)

**Files:**
- Modify: `.claude/skills/write-sweep-guide/SKILL.md`
- Create (not committed): `$CLAUDE_JOB_DIR/tmp/skill-trial/trial-guide.md`, `trial-notes.md`

- [ ] **Step 1: Trial run.** A fresh sonnet subagent gets the expanded skill, the doc and `excerpt.md` (same as the baseline), and may run `pnpm sweep validate`. It must loop until 0 errors and produce the conversion report.
- [ ] **Step 2: Review.** Validate the result yourself (`pnpm sweep validate …`: exit 0). Check it against the excerpt with the Task 4 checklist, plus Review Focus items 3 and 4. Record the findings in `trial-notes.md`.
- [ ] **Step 3: Refactor.** For each new failure, add or sharpen a line in the skill. If the changes are substantive, repeat Steps 1–2 once.
- [ ] **Step 4: Commit.** `git commit -m "docs(skill): tighten write-sweep-guide after a trial conversion"`, with the trial result summarized in the body (source, sections/tasks, validate iterations, issues found).

### Task 8: Final verification and handoff

- [ ] **Step 1:** From the worktree root: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm validate:examples`. All pass.
- [ ] **Step 2:** Update `guides/examples/README.md` and `docs/guide-format.md` so neither refers to "once the validator lands".
- [ ] **Step 3:** Whole-branch review (superpowers:requesting-code-review), then report to the orchestrator and the user: branch, commits, the trial result, and any open spec questions.
