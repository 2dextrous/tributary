# Tributary

A supply chain digital twin in one web page. Put in your plants, DCs, demand points, products, costs and past demand, then move a lever and watch the whole network re-plan: forecast, DC choice, inventory, trucks, returns and a year of simulated operations.

## Run it
```
npm test            # check the maths
python3 build.py    # build dist/tributary.html
```
Then open `dist/tributary.html` in a browser. No server and no installs needed.

## What is inside
- **Forecasting:** Holt's method with top-down seasonality, compared against "same week last year".
- **Network design:** every combination of candidate DCs costed in full, with min-cost flow routing.
- **Inventory:** order-up-to policy, safety stock from forecast error, square-root pooling.
- **Transport:** truck-by-truck line-haul, last-mile part loads, CO₂ estimate.
- **Returns:** reverse freight, processing, write-off and refurbishment recovery.
- **Simulation:** 52-week Monte Carlo runs, including plant outages and rerouting.
- **Copilot:** plain-English what-ifs with two human approval gates and a decision log.

The **How it works** tab in the app documents every formula.

## Working on it with Claude Code
Open this folder in Claude Code. `CLAUDE.md` gives it the architecture, contracts and rules. A hook runs the tests after every edit, and the `math-reviewer` subagent checks engine changes.
