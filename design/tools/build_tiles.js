// Builds design/tiles/index.html: three style tiles in one self-contained page, driven by real engine output.
// Run: node design/tools/build_tiles.js  (about 10 s: it solves every freight x demand step the sliders offer)
const fs = require('fs');
const path = require('path');
const T = require('../../src/engine.js');

const root = path.join(__dirname, '../..');
const data = T.defaultData(), fc = T.forecast(data);
const F = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6], G = [-0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4];
const COMP = ['secondary', 'fixed', 'reverse', 'holding', 'primary', 'plant', 'handling', 'ordering', 'unmet'];
const idx = (list) => Object.fromEntries(list.map((x, i) => [x.id, i]));
const P = idx(data.plants), Dc = idx(data.dcs), C = idx(data.customers);
const k = (x) => Math.round(x / 1e3);   // money in thousands of rupees keeps the page small
const grid = {};
for (const f of F) for (const g of G) {
  const L = Object.assign(T.defaultLevers(), { freightIndex: f, demandGrowth: g });
  const r = T.optimize(data, fc, L), s = T.simulate(data, fc, L, r, { reps: 30 });
  grid[f + '|' + g] = {
    t: k(r.total), c: COMP.map(key => k(r.comp[key])), o: r.open, fill: +s.fillRate.toFixed(4), inv: k(r.kpi.inventoryValue),
    un: +r.kpi.unservedShare.toFixed(4), units: Math.round(r.kpi.annualUnits),
    p: r.primaryLanes.map(l => [P[l.from], Dc[l.to], +l.slotsWk.toFixed(1)]),
    s: r.secondaryLanes.map(l => [Dc[l.from], C[l.to], +l.slotsWk.toFixed(1)])
  };
}
const D = {
  F, G, grid,
  plants: data.plants.map(p => [p.name, p.lat, p.lon]), dcs: data.dcs.map(d => [d.name, d.lat, d.lon]),
  cust: data.customers.map(c => [c.name, c.lat, c.lon, c.weight])
};
const outline = JSON.parse(fs.readFileSync(path.join(root, 'design/map/india-outline.json'), 'utf8'));
const page = fs.readFileSync(path.join(root, 'design/tiles/src/template.html'), 'utf8')
  .replace('/*@DATA@*/null', JSON.stringify(D)).replace('/*@OUTLINE@*/null', JSON.stringify(outline.rings));
fs.writeFileSync(path.join(root, 'design/tiles/index.html'), page);
console.log(`built design/tiles/index.html (${Math.round(page.length / 1024)} KB, ${Object.keys(grid).length} solved scenarios)`);
