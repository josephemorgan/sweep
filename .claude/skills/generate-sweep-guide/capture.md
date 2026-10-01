# Capturing GameFAQs pages with the `sweep-chrome` MCP

GameFAQs sits behind Cloudflare Turnstile. Every fetch from outside a real browser (curl,
WebFetch, tavily, Playwright, a launched Chrome) gets a challenge. What works is a real Chrome
with its own profile, attached (not launched) through the local MCP server `sweep-chrome`
(tools `mcp__sweep-chrome__*`). Inside that browser, navigations and same-origin `fetch()`
calls both come back as real pages.

**Only these tools touch GameFAQs.** No curl, WebFetch, tavily, the `chrome-devtools` plugin
MCP, hand-rolled CDP scripts, stealth or webdriver patches, cookie export, or CAPTCHA solvers.
When the tools are listed as deferred, load them first with
`ToolSearch("select:mcp__sweep-chrome__list_pages,mcp__sweep-chrome__navigate_page,mcp__sweep-chrome__evaluate_script,mcp__sweep-chrome__fill,mcp__sweep-chrome__click,mcp__sweep-chrome__take_snapshot")`.
If the MCP isn't connected (`mcp__sweep-chrome__list_pages` fails), stop and tell the user:
the browser is started by hand (`WAYLAND_DISPLAY=wayland-1 google-chrome-stable
--ozone-platform=wayland --user-data-dir=$HOME/.config/sweep-chrome
--remote-debugging-port=9223 --no-first-run --no-default-browser-check <url>`), and a session
only sees MCP servers that existed when it started.

## Page anatomy

| Page | URL | Where the data is |
|---|---|---|
| Game search | `https://gamefaqs.gamespot.com/search?game=<name>` | Result links `a[href^="/<platform>/<id>-<slug>"]`; the platform list after each ("AND, IOS, NS, PC, PS, …"). The search is a form: open it, then `fill` + click "Search Games" if the URL alone shows no results. |
| Guides listing (per platform) | `/<platform>/<id>-<slug>/faqs` | One `li` per FAQ: `a[href$="/faqs/<faqId>"]`; the `li` text is `<Type> by <author> [HTML] v.<ver>, <size>KB, <date> [*Most Recommended*|*Highest Rated*]`. Sections: Full Game Guides, In-Depth Guides, foreign-language, cheats. |
| FAQ index (HTML FAQ) | `/<platform>/<id>-<slug>/faqs/<faqId>` | TOC in `#faq_toc ul.toc_menu a` with **relative** slug hrefs (`alexandria`). Body in `#faqwrap`. |
| FAQ sub-page | `…/faqs/<faqId>/<slug>` | `#faqwrap` again (it repeats the TOC in `div.ftoc`). |
| FAQ (plain text) | `/<platform>/<id>-<slug>/faqs/<faqId>` | The entire guide in `#faqtext` (a `div.faqtext`), one page, no TOC. Up to ~1MB. |

Read listings and TOCs with `evaluate_script` returning small JSON, not `take_snapshot`
(a snapshot of a listing is ~500 lines).

Listing extractor (run on the guides listing):

```js
() => [...document.querySelectorAll('a[href*="/faqs/"]')]
  .filter((a) => /\/faqs\/\d+$/.test(a.getAttribute('href')))
  .map((a) => ({ href: a.getAttribute('href'), text: (a.closest('li') || a.parentElement).innerText.replace(/\s+/g, ' ').trim() }))
```

TOC extractor (run on an HTML FAQ's index page):

```js
() => [...document.querySelectorAll('#faq_toc ul.toc_menu a')].map((a) => ({ slug: a.getAttribute('href'), title: a.textContent.trim() }))
```

## Capturing

Every capture call sets `filePath` so the page text goes to disk, never through the
conversation. The MCP only writes inside the repo, so `filePath` is the absolute path of the
source directory in the checkout you're working in (the worktree, when in one):
`<checkout>/guides/<game>/source/<faqId>-<author>/capture-NN.json`. It creates the directory.

**HTML FAQ:** open the index page, then run the function in `scripts/capture-faq.js`
(everything after `export default`) through `evaluate_script` (`waitForStableDom: false`),
with `SLUGS` set to the next batch of 20 or fewer TOC slugs and `filePath` =
`…/capture-01.json`, `…/capture-02.json`, and so on. It fetches each slug from inside the
page 1s apart and keeps the raw `#faqwrap` HTML plus a Markdown rendering of the same DOM
(headings, tables, lists, spoiler spans, no `div.ftoc`). Batches are independent: several can
run in one turn.

**Plain-text FAQ:** open the FAQ page, then one call with `filePath` = `…/capture-01.json`:

```js
() => ({ capturedAt: new Date().toISOString(), pages: [{ slug: 'full', url: location.href, status: 200, title: document.title, text: document.querySelector('#faqtext').innerText }] })
```

Then, from the repo root:

```sh
node .claude/skills/generate-sweep-guide/scripts/unpack-capture.mjs guides/<game>/source/<faqId>-<author>
```

It needs `faq.json` in that directory first (the listing row as fields: `id`, `title`,
`author`, `url`, `listing`, `type` `"html"` or `"text"`, `award`, `version`, `size`, `date`,
`platform`). It writes `pages/NN-<slug>.html|md`, `full.md` (or `full.txt`) and
`manifest.json`, and exits 1 listing any page that failed, so a batch can be re-run for just
those slugs.

## When a challenge appears

A page without `#faqwrap`/`#faqtext` whose HTML mentions "verify you are human",
`challenge-platform` or `cf-turnstile` is a Turnstile page; the capture loop stops there and
`unpack-capture` lists the slug under failed.

1. Keep everything captured so far.
2. Tell the user which page hit the challenge and ask them to tick it in the Chrome window.
3. After they confirm, `navigate_page` to that page, check `#faqwrap` is back, and re-run the
   batch from the first failed slug.

Never try to get around it: no retries with another tool, no fingerprint changes, no
switching to another site. If the user can't clear it, report what was captured and stop.
