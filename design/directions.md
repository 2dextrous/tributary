# Phase 2: direction

`tiles/index.html` is one self-contained page with three candidate looks for the main screen. Switch between them with A, B and C on the bar at the bottom, and between light and dark. Every number is real: `tools/build_tiles.js` runs the engine for each of the 63 freight × demand steps the sliders offer and inlines the results. Rebuild with `node design/tools/build_tiles.js`.

## Brand attributes

- **Credible.** Planner-grade numbers, honest labels, nothing decorative that could be mistaken for data.
- **Clear.** One headline figure, one obvious first move, plain words first and detail on request.
- **Alive.** The network visibly responds the moment you change something.
- **Rooted.** India's real map and cities, priced in rupees and crore.

## The three directions

| | A · Clear | B · Night shift | C · Atlas |
|---|---|---|---|
| Idea | A calm planning product | An operations room after dark | A data-journalism graphic styled after Survey of India topographic sheets |
| Built for | Light | Dark | Light |
| Type | The phone's system font | IBM Plex Sans, with IBM Plex Mono for figures | Newsreader serif for figures and headings, system font for text |
| Type scale | 12 / 13 / 15 / 19 / 24 / 30 / 56 | 12 / 13 / 15 / 18 / 22 / 26 / 48 | 12 / 13 / 15 / 20 / 27 / 36 / 64 |
| Colour | Ink UI; blue flows, orange DCs | Cyan glowing flows, amber DCs, pink plants | Pale olive land, blue-tinted sea, ink-blue routes, survey-red DCs |
| Shape | White cards, soft shadows, pill buttons | Thin borders, 6 px corners, dotted map | No cards: ruled sections, underlined choices |
| Signature | Nothing competes with the map | Glow and a "live" dot | A caption that says what changed on the map |
| Font cost | 0 KB | 2 families | 1 family |

All three share the same layout. On a phone, the cost and four ready-made scenarios fill the first screen, with the map right below, so the first tap shows its effect without scrolling.

## Tokens

There are two tiers. Each direction is only a list of primitives: `--l-*` for light, `--d-*` for dark, plus its fonts, type scale and shape. One shared block maps 25 roles (`--text`, `--surface`, `--flow`, `--dc` and so on) to those primitives, so adding a look or a theme never touches component CSS. The spacing scale (4–48 px on an 8 px rhythm) and motion timings are shared.

## Checks (all measured, all passing)

Measured with `tools/inventory.js` on `tiles/index.html`, at 375 and 1440 px, for every direction in light and dark, plus each direction's extreme scenario (freight +50%, demand +40%):

- Text contrast: no failures; every role is listed with its ratio in the page's design notes.
- axe-core (WCAG 2.2 A and AA): no violations.
- Touch targets: none under 44 px.
- Smallest text: 12 px (map labels and table captions).
- Map labels: 0 overlaps in all 18 views.
- No horizontal scroll at 375 px.

Colour-blind separation is not a target, by the owner's decision on 18 October 2026. Cost up/down still carries ▲/▼ as well as colour.

The map uses Natural Earth's India point-of-view boundary (public domain), simplified with mapshaper to 9 KB in `map/india-outline.json`. The moving flow marks have a pause button, and the reduced-motion setting removes them.

## Next: Phase 3

After the tests pick a winner (see `test-script.md`), Phase 3 builds it into the app behind a toggle: "Classic look" and "New look" in the header, stored per visitor and set as `data-look` on `<html>`. The winning direction's tokens and layout apply only under the new look, so the classic look stays available for side-by-side comparison and an old-versus-new preference test.
