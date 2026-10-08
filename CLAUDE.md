# Tributary: supply chain digital twin

A one-page browser app. A business owner enters plants, DCs, demand points, products, costs and demand history. The app forecasts demand, picks the cheapest DC network, sizes inventory, plans trucks, costs returns and simulates a year. A copilot turns plain-English what-ifs into lever changes behind two human approval gates.

## Commands
- `npm test`: engine tests (Node 20+, no dependencies). Must pass before any commit.
- `python3 build.py`: assembles `src/` into `dist/tributary.html`, one self-contained file.
- Open `dist/tributary.html` in a browser to try it. The copilot's plain-English mode only works when the page is published as a claude.ai artifact; elsewhere it falls back to quick what-ifs.
- `npm run deploy`: tests, builds and force-pushes the site (`index.html`, `assets/og.png`) to the `gh-pages` branch. Live at https://2dextrous.github.io/tributary/. Refuses to run with uncommitted changes. Ask the owner before deploying: the site is public.

## Public site
- The page is public and linked from LinkedIn. Keep the welcome card (`showWelcome` in `src/app.js`), the footer credit and the link-preview tags in `src/head.html` working.
- `assets/og.png` is the 1200×627 link-preview image. Retake it if the look of the map or summary panel changes.

## Layout
- `src/engine.js`: all the maths. Pure functions on plain data, no DOM. Exposes `window.TRIB` in the browser and `module.exports` in Node.
- `src/app.js`: UI only (map canvas, charts, levers, tabs, scenarios, copilot). It renders engine output and never computes business numbers itself.
- `src/worker.js`: the engine host. `app.js` runs it in a Web Worker built from the page's own engine and host scripts (the `trib-engine` and `trib-host` tags from `build.py`), so solves never freeze the page; if a worker cannot start, the same host runs on the main thread. It keeps the data, the forecast and `pp`, and sends back only plain data. `app.js` reaches it through `Engine`, always asynchronously.
- `src/styles.css`, `src/body.html`, `src/head.html`: design tokens and markup.
- `tests/engine.test.js`: known-answer tests. Every engine change gets a test.
- `tests/worker.test.js`: checks the host matches the engine and that every reply survives a structured clone.

## Engine contracts (ask before changing a shape)
- `forecast(data)` returns `series["custId|skuId"] = {fc: {smart, naive}[52], sigma, wmape, bias, pred}`, `products[skuId] = {wmape, bias, fva}`, `seasonal`.
- `prepare(data, fc, levers)` returns `pp`: demand, distances and lane costs.
- `evaluate(pp, openDcIdx, detail)` returns `{total, comp}`. `comp` keys: fixed, plant, handling, primary, secondary, holding, ordering, reverse, unmet. With `detail`: dcs, inv, primaryLanes, secondaryLanes, returns, kpi.
- `optimize(data, fc, levers)` returns the full `evaluate` of the best design, plus `alternatives` (top 6) and `search`.
- `sweep(data, fc, levers, key, values)` and `simulate(data, fc, levers, net, {reps})`.

## Units and conventions
- Time bucket is the week. Money is ₹ per year unless the name says otherwise. The UI shows crore and lakh.
- Trucks and capacity use load units (lu) = units × product cube. Inventory and service use units.
- Lever indices: 1.0 means today. Rates are fractions (0.24 is 24%).
- Road km = haversine km × `costs.roadFactor`. Lead time L and review period R are whole weeks.

## Rules
- Randomness only through `util.rngFrom(seed)` so results are reproducible.
- Every number in the UI comes from the engine. No hard-coded results.
- Only structured-cloneable data crosses the worker boundary: no functions, and no `pp` beyond `res.pp.mu`. If the UI needs more, add it to the host's reply.
- Keep the built page publishable: no external scripts except cdnjs or jsDelivr, no remote images or fetches, `localStorage` wrapped in try/catch, light and dark tokens in `styles.css`, `prefers-reduced-motion` respected.
- The copilot never applies a change without the user clicking "Approve and run", and can never promote a baseline.
- Exhaustive DC search grows as 2^n. Keep free candidate DCs at 11 or fewer, or move to a MILP.
- UI copy: sentence case, active voice, no ALL CAPS labels.

## How to work here
1. Describe the maths in plain words first: update `METHOD_HTML` (the How it works tab) in `src/app.js`.
2. Write a known-answer test, then implement until `npm test` passes.
3. Use Plan Mode for anything that touches more than one engine function.
4. Run `python3 build.py` and click through the changed tab in a browser.
5. After engine changes, ask the `math-reviewer` subagent to check the work.
6. The owner presents this project in interviews. Explain every formula you add so they can defend it.

## Known limits and roadmap
- Network design uses average weekly volume; peak-season capacity is only tested in the simulation.
- One replenishment cycle per DC for all products; lead time comes from the DC's main plant.
- Next: Python/Pyomo port with the HiGHS solver for bigger networks, multi-echelon inventory, per-product cycles, real road distances, Excel export of scenarios.
