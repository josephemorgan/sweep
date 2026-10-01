---
name: generate-sweep-guide
description: Use when asked to make a Sweep guide for a game from GameFAQs (or "find a walkthrough and turn it into a guide"), before any page is opened or FAQ chosen. Covers finding, ranking and capturing the FAQs; the conversion itself is write-sweep-guide.
---

# Generate a Sweep guide from GameFAQs

## Overview

Find the game's FAQs on GameFAQs, pick two or three, capture them to disk through the
attached Chrome, read them, and hand the material to `write-sweep-guide`. The output of this
skill is a **source packet** (below); the guide file and conversion report come from
write-sweep-guide, with every closure citing the FAQ page it came from.

**REQUIRED SUB-SKILL:** `write-sweep-guide` for the conversion. **REQUIRED READING:**
`capture.md` in this directory before the first browser call (page anatomy, snippets,
challenge handling). GameFAQs is reached only through the `mcp__sweep-chrome__*` tools.

## Inputs to confirm

State these as assumptions in one message, then go: the game and **platform** (the guides
listing is per platform; the user's platform wins, and the original release's listing
usually holds the most FAQs), the container (`.md` by default) and scope (write-sweep-guide's
list). Paths follow `guides/ff8/final-fantasy-viii.yaml`: directory `guides/<game>/` (short
slug), guide `guides/<game>/<full-game-slug>.md`, report next to it as
`<full-game-slug>.report.md`, sources under `guides/<game>/source/`.

## Procedure

**1. Search.** Open `https://gamefaqs.gamespot.com/search?game=<name>`; submit the form if no
results show. Pick the result whose title matches, then open `/<platform>/<id>-<slug>/faqs`
for the chosen platform. Extract the listing with the snippet in capture.md.

**2. Rank.** Build a table of the Full Game Guides plus the In-Depth guides whose title
contains Missable, Secrets, Sidequests, Point of No Return, Item Location or Perfect Game,
with columns: type, author, format (HTML or text), award, version, size, date. Then choose:

- **Primary:** a full walkthrough. Order by award tier (*Most Recommended* > *Highest Rated*
  > none), then completeness (a "Final"/full version, size, a later date), then format (HTML
  over text: its tables and alert boxes survive capture).
- **Missables guide:** the best-ranked In-Depth guide from the set above, by the same order.
- **Second walkthrough (optional):** the next full walkthrough when it's within one award
  tier of the primary and a different author; skip it otherwise.

Write the table and the picks into the report's Attribution section as they're decided.

**3. Capture** each pick into `guides/<game>/source/<faqId>-<author>/` (gitignored:
`guides/*/source/`). A directory that already has a `manifest.json` with an empty `failed`
list is a finished capture: reuse it. Anything else there is a leftover: delete the directory
and capture again. Per FAQ: write `faq.json` from its listing row, run the capture
(capture.md), run `unpack-capture.mjs`, and check `manifest.json`: `pages` count equals the
TOC count (or 1 for text) and `failed` is empty. A challenge stops the capture; capture.md
says what to do, and the answer is never a workaround.

**4. Read.** The **primary is read in full**: `full.md` (or `full.txt`), page by page, by
implementer subagents when it's over ~150KB (one per disc or chapter group), each returning
write-sweep-guide's four inventory lists with quotes. The **other FAQs are searched, not
read**: grep their `full.md`/`full.txt` for write-sweep-guide's closure words ("no going
back", "point of no return", "last chance", "won't be able", "can't return", "unavailable",
"sealed", "blocked", "missable", "make sure", "before you") plus "permanently" and "forever",
and read each hit in its paragraph. Record every hit that names a task or place as a row:
`<faqId>-<author> / <page slug or line>`, quote, place, task.

**5. Hand off** to write-sweep-guide with the source packet:

- `guides/<game>/source/<primary>/manifest.json` and `full.md` (the walkthrough);
- `guides/<game>/source/closures.md`: the step-4 rows from every FAQ, primary included;
- the ranking table and picks.

The conversion report is written to `<full-game-slug>.report.md` next to the guide and
committed with it. In it, every row of the Closures table and every quote under Assumptions
and Unmodeled later chances starts with its source: `[<faqId>-<author>/<slug>]`. When two
FAQs disagree on a closure, the primary's wording decides the window and the other quote goes
under Assumptions with both citations. Attribution lists every captured FAQ (title, author,
URL, version, date) and its licence as the FAQ's own legal section states it, or "not
stated".

## Red flags

| Thought | Do instead |
|---|---|
| "I'll return the page text from `evaluate_script` and write it to a file." | Set `filePath` on the call. Page text never passes through the conversation. |
| "`innerText` is enough." | Keep the raw HTML and the DOM-rendered Markdown (capture-faq.js). Tables and alert boxes carry the missables. |
| "One good walkthrough is enough." | Always one missables guide too; closures are the whole point. |
| "I'll read all three in full." | Primary in full, the others searched for closure words. |
| "It's a Turnstile page; I'll fetch it another way." | Stop, keep what's captured, ask the user to tick it. |
| "The closure table cites 'the FAQ'." | Every quote starts with `[<faqId>-<author>/<slug>]`. |
| "The source text can go in git." | `guides/*/source/` stays ignored; commit only the guide and report. |
