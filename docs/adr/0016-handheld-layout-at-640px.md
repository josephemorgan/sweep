---
status: accepted
date: 2026-09-30
---

# 0016. The handheld layout adapts to a 640 px wide viewport

## Context

Spec §5.9 designed the 4:3 landscape layout for an assumed 1024×768 CSS viewport: a 340 px route pane on the left, a detail pane on the right with its categories in two columns, and the four metrics folded into the top bar as inline number-and-label pairs. §11.3 left the real device's viewport as an open question.

A screenshot taken on the Retroid answers it. The screen is 1280×960, but Chrome runs at a device pixel ratio of 2, so the CSS viewport is **640 px wide** and about 400 px tall under Chrome's URL bar (about 450 px as an installed PWA, 480 px fullscreen). The `(orientation: landscape) and (max-height: 800px)` query still matches, so the two-pane layout renders, but width is the scarce resource there, not height:

- The 340 px route pane is 53 % of the viewport. With its border and the detail pane's 48 px of padding, 251 px remain for the detail card, which two columns halve to about 110 px each. Category headers wrap onto two lines and task titles wrap one word per line.
- The four inline metric pairs cost about 390 px. With the back, filter and menu buttons, the run title is left with about 55 px and truncates to a few characters.

1024×768 remains a real target (an iPad in landscape, for example), so the wide layout must keep working.

## Decision

One width threshold, **920 px**, splits the handheld layout into a narrow and a wide variant. Both still require the landscape, max-height 800 px query. 920 px is the width at which two 250 px columns fit beside a 340 px route pane (340 + 1 border + 48 padding + 32 gap + 2 × 250).

- **Route pane width** is `min(340px, 47vw)`: 340 px as before, capped at 47 % of the viewport. On the Retroid that is 301 px, leaving 338 px for the detail pane. Nothing changes from 724 px up.
- **Detail-pane columns:** two at 920 px and up, one below. The column count is decided in the page from a `WIDE_DETAIL_QUERY` media query, like the handheld query, because it changes how the categories are split, not only how they are styled.
- **Detail-pane padding** drops from 24 px to 16 px per side below 920 px.
- **Header metrics** below 920 px are stacked, number over a small label, as on the phone bottom bar, with 8 px of horizontal padding instead of 12 px. The four metrics and the filter icon then take about 265 px instead of about 390 px. At 920 px and up they stay inline number-and-label pairs. The title still truncates with a tooltip as a last resort.
- **The unsaved badge** reserves 44 px instead of 112 px below 920 px and shows only the dot and the count; its screen-reader text is unchanged. With that, the title keeps about 220 px on the Retroid (measured 218 px).
- **The e2e `handheld-4x3` project** models the real device: a 640×400 viewport, device scale factor 2, touch. The 1024×768 case keeps its own assertions (340 px pane, two columns) in a `test.use` block of the layout test rather than a third project, so CI runs no extra pass.
- The Tailwind `handheld` variant gains a sibling for the styling-only rules below 920 px, next to the JS query, following the existing pattern of one media query mirrored in `run-layout.ts` and `styles.css`.

## Consequences

- Spec §5.9's fixed 340 px pane and two-column detail card now describe the wide variant only. §5.9 and §11.3 are amended to say so and to record the measured viewport.
- The 920 px number lives in two places (`run-layout.ts` and `styles.css`), as the handheld query already does. A change to one must be mirrored in the other.
- A landscape phone (for example 844×390) also falls on the narrow side. It keeps the 340 px pane (47 % of 844 px is more than that) but gets one detail column, the tighter padding and the stacked metrics.
- Height is not addressed. At 400 px the panes show about four task rows below the card title, and both panes scroll on their own as before.

Source: spec §5.9 and §11.3; the Retroid screenshot of 2026-09-30.
