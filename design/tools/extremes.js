// Worst cases a design must survive, pulled from the engine. Run: node design/tools/extremes.js
const T = require('../../src/engine.js');
const cr = (x) => (x / 1e7).toFixed(1);

const longest = (list) => list.reduce((a, b) => (b.length > a.length ? b : a), '');
const d0 = T.defaultData();
console.log('Longest names: city library', JSON.stringify(longest(T.CITIES.map(c => c.name))),
  '| demand point', JSON.stringify(longest(d0.customers.map(c => c.name))), '| DC', JSON.stringify(longest(d0.dcs.map(c => c.name))),
  '| product', JSON.stringify(longest(d0.products.map(p => p.name))), '| typed names: unlimited (Your data accepts any text)');

// lever corners: the range of every headline figure the hero has to lay out
const fc = T.forecast(d0), base = T.defaultLevers();
const corners = [
  ['today', {}], ['freight x0.5', { freightIndex: 0.5 }], ['freight x2', { freightIndex: 2 }], ['demand -40%', { demandGrowth: -0.4 }],
  ['demand +80%', { demandGrowth: 0.8 }], ['service 99.5%', { serviceLevel: 0.995 }], ['max 400 km', { maxServiceKm: 400 }],
  ['DC cost x2.5', { dcFixedIndex: 2.5 }], ['all DCs open', { locks: Object.fromEntries(d0.dcs.map(d => [d.id, 'open'])) }]
];
console.log('\nScenario      | cost cr | DCs | fill   | unserved | inventory cr | trucks/wk | biggest/smallest last-mile lane lu/wk | lanes');
for (const [name, ch] of corners) {
  const L = Object.assign(T.defaultLevers(), ch), r = T.optimize(d0, fc, L), s = T.simulate(d0, fc, L, r, { reps: 10 });
  const v = r.secondaryLanes.map(l => l.slotsWk);
  console.log(`${name.padEnd(13)} | ${cr(r.total).padStart(7)} | ${String(r.open.length).padStart(3)} | ${(s.fillRate * 100).toFixed(1).padStart(5)}% | ${(r.kpi.unservedShare * 100).toFixed(1).padStart(7)}% | ${cr(r.kpi.inventoryValue).padStart(12)} | ${r.kpi.trucksPerWeek.toFixed(1).padStart(9)} | ${Math.max(...v).toFixed(0)} / ${Math.min(...v).toFixed(1)} (x${(Math.max(...v) / Math.min(...v)).toFixed(0)}) | ${r.primaryLanes.length} + ${r.secondaryLanes.length}`);
}

// 11 free candidate DCs: the most the exhaustive search is meant to handle
const d11 = T.defaultData();
for (const n of ['Indore', 'Visakhapatnam']) { const c = T.CITIES.find(x => x.name === n); d11.dcs.push({ id: 'D' + (d11.dcs.length + 1), name: n, lat: c.lat, lon: c.lon, fixedCost: 1.8e7, capacity: 5000, handling: 18 }); }
const f11 = T.forecast(d11), t0 = Date.now(), r11 = T.optimize(d11, f11, base);
console.log(`\n11 free DCs: ${r11.search.configs} designs, ${r11.search.evaluated} costed in ${Date.now() - t0} ms on this machine, ${r11.open.length} open, ${d11.plants.length + d11.dcs.length + d11.customers.length + 1} map markers`);

// uploaded history at its limits: 60 to 156 weeks per demand point and product
console.log(`Uploaded history: 60 to 156 weeks x ${d0.customers.length} demand points x ${d0.products.length} products = up to ${156 * d0.customers.length * d0.products.length} rows`);
