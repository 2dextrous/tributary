# Phase 1: diagnosis

Measured on 18 October 2026 against commit 6beb6fd, the build that is live at https://2dextrous.github.io/tributary/. Every number below comes from a script in `design/tools/`, so any change can be re-measured the same way:

- `make_probe.py` + `inventory.js`: text sizes, contrast against the real background, touch targets and axe-core findings, for every tab and state at 375 and 1440 px, in light and dark.
- `color_check.js`: text drawn on canvases (which axe cannot see) and colour-blind separation.
- `extremes.js`: worst-case data from the engine.
- Lighthouse 12.2 mobile (simulated slow 4G, 4x CPU) for speed.

## The page's job

A LinkedIn visitor, usually on a phone, should understand within 5 seconds that this plans an Indian supply chain. Within a minute they should change something and see the network and the cost respond. Success, measured with `test-script.md`:

1. 4 of 5 testers can say what it is after a 5-second look.
2. 4 of 5 make a change and state its effect within 60 seconds, on their own phone.
3. axe finds no serious issue in any state, at 375 and 1440 px, in light or dark.

Still missing: the reviewer's own words, their device, and what they compared it with. Those decide which of the findings below matter most.

## What a phone visitor meets (375 × 812)

| Element | Position |
|---|---|
| Header | 92 px tall, on two rows: brand, then "Pin as scenario", "Make baseline", "Copilot" |
| Map | 92–612 px |
| Headline cost | starts at 638 px |
| First lever | 1,310 px, 1.6 screens down |
| Tabs | 2,195 px |
| Whole page | 3,395 px |

- Moving a lever and seeing its effect means scrolling 1.5 screens back up.
- The welcome card is 698 px tall on an 812 px screen and scrolls. About 130 words come before its first button.
- Errors never show. The status line is hidden below 820 px, so "Could not solve this scenario: every DC is locked closed" neither appears nor is announced, because `display: none` also removes the live region.

## Type

- 13 text sizes from 11.5 to 66 px, with no scale behind them.
- Across the tabs, 55–90% of text elements are under 14 px. On the Network tab it is 215 of 240.
- Three families: Archivo for UI (1,349 elements), Big Shoulders Display for numbers (100) and Big Shoulders Stencil for headings (23).
- Fonts are 166 KB of the 237 KB live page, in five files.

## Contrast (WCAG 1.4.3 text 4.5:1, 1.4.11 controls 3:1)

The light theme fails; dark passes everything. One token, `--ink-3`, causes almost all of it.

| Where | Colours | Ratio | Size |
|---|---|---|---|
| Inactive tabs, lever hints, status line, tagline, footer | #657F95 on #E6F0F6 | 3.62:1 | 11.5–14 px |
| Closed DC rows, welcome note, copilot status | #657F95 on #F7FBFD | 4.02:1 | 12–13.5 px |
| "This is your baseline" chip | #657F95 on #D9E7F0 | 3.31:1 | 13 px |
| Map hint, map grid labels, DC candidate labels | #657F95 on #DDEBF4 | 3.44:1 | 10.5–12 px |
| Plant labels on the map | #00789D on #DDEBF4 | 4.14:1 | 12.5 px bold |
| Returns hub label | #A86200 on #DDEBF4 | 3.91:1 | 11.5 px bold |
| Chart axis labels | #657F95 on #F7FBFD | 4.02:1 | 11.5 px |
| Loading placeholder "₹…" | #B4C9D8 on #F7FBFD | 1.64:1 | 66 px |
| Unfilled slider track (a control) | #B4C9D8 on #E6F0F6 | about 1.5:1 | 3 px line |

axe `color-contrast` (serious): 289 nodes across 12 of 13 states at 1440 px light, 254 at 375 px light, none in dark. Map and chart text is drawn on canvas, so those rows come from `color_check.js`.

## Colour blindness

Separation is OKLab distance × 100; under 10, two colours are hard to tell apart.

| Pair | Normal | Protan | Deutan | Tritan |
|---|---|---|---|---|
| Good/bad deltas, light (#16764A / #BE342A) | 26.2 | 8.7 | 7.8 | 30.8 |
| Good/bad deltas, dark (#45D99A / #FF6E64) | 31.7 | 20.6 | 8.3 | 36.3 |
| Map markers, light (closest pair) | 20.8 DC/returns | 12.7 plant/DC | 8.1 plant/DC | 8.9 DC/returns |
| Map markers, dark (closest pair) | 16.9 plant/demand | 10.3 plant/demand | 13.1 plant/DC | 16.9 plant/demand |

The +/− signs carry the meaning of deltas, but colour alone does not. On the map, square plants and diamond DCs carry it.

## Touch targets (WCAG 2.5.8 needs 24 px; phones need about 44)

| Control | Smallest size |
|---|---|
| Sliders | 22 px tall, with a 14 px thumb |
| Segmented buttons (forecast method, buffers, DC controls) | 37 × 27 |
| Header buttons | 33 px tall |
| Small buttons ("Back to baseline", drawer "Close") | 26 px tall |
| Copilot chips | 31 px tall |
| Footer "About this app" | 20 px tall |

Every control on the page is under 44 px.

## Map and motion accessibility

- A screen reader gets a generic element named "Map of plants, distribution centres, demand points and flows". It says nothing about which DCs are open, where goods flow or what goes unserved.
- Map tooltips and DC locks are pointer-only. The Network tab has keyboard locks.
- Flow particles move continuously with no pause control (WCAG 2.2.2, Level A). Only the operating system's reduced-motion setting stops them.
- At 375 px, six horizontally scrolling tables cannot be scrolled from the keyboard (axe `scrollable-region-focusable`, serious).

## Speed (Lighthouse mobile)

| | Live site | Local build |
|---|---|---|
| Performance score | 76 | 74 |
| Largest contentful paint | 3.9 s | 4.3 s (no compression locally) |
| Total blocking time | 0 ms | 0 ms |
| Cumulative layout shift | 0 | 0.067 |

The target is under 2.5 s. Lighthouse scores accessibility 100, yet axe run state by state finds 289 contrast failures: Lighthouse audits only the first screen, with the welcome dialog over it.

## Nielsen's heuristics

Severity is Nielsen's 0–4 scale (4 = must fix).

| # | Heuristic | Severity | Finding |
|---|---|---|---|
| 1 | Visibility of system status | 3 | On phones the status line is hidden, so errors and finished solves are silent. |
| 2 | Match with the real world | 3 | lu/wk, cycle service level, WMAPE, line-haul, sweep, pin and baseline all appear up front. |
| 3 | User control and freedom | 2 | "Back to baseline" sits below all eight levers. There is no undo for a single lever. |
| 4 | Consistency and standards | 2 | 13 text sizes, three display families, and magenta for seven roles (flows, DCs, main button, active tab, sliders, focus, links). |
| 5 | Error prevention | 2 | You can lock every DC closed, and only then does it fail. |
| 6 | Recognition over recall | 3 | Ready-made scenarios hide in the Copilot drawer. The welcome card's "three things to try" must be remembered after it closes. |
| 7 | Flexibility and efficiency | 1 | Copilot and keyboard tab navigation serve experts. Map locks are pointer-only. |
| 8 | Aesthetic and minimalist design | 3 | The first screen gives equal weight to 6 figures, 8 sliders, a legend and 3 buttons. The checkered map frame is the highest-contrast thing on it, and the map has no outline of India. |
| 9 | Recognise and recover from errors | 3 | The only error message is grey 12.5 px text, missing on phones, and it does not say how to fix the problem. |
| 10 | Help and documentation | 1 | How it works is thorough, but it is the last tab, and jargon has no inline help. |

## Worst cases to design against (`extremes.js`)

| What | Range |
|---|---|
| Headline cost | ₹32.9 cr (demand −40%) to ₹133.8 cr (demand +80%): up to five digits plus the unit |
| DCs in use | 3 to 9; with 11 candidates, 57 markers on the map and 2,047 designs (0.8 s on a laptop, several seconds on a phone) |
| Unserved demand | 0% normally, 8.6% at demand +80%, 19.3% with a 400 km delivery limit; it needs a visible state |
| Last-mile lanes | 29 to 46; volumes differ 10× normally and up to 10,000× when DC rent is high, so flow width needs a floor |
| Names | Thiruvananthapuram (18 characters) in the city list; names typed in Your data have no limit |
| Uploaded history | 60 to 156 weeks, up to 19,656 rows |
