// Known-answer tests for the maths. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/engine.js');

const data = T.defaultData();
const fc = T.forecast(data);
const L = T.defaultLevers();
const base = T.optimize(data, fc, L);

test('inverse normal matches z-tables', () => {
  assert.ok(Math.abs(T.util.invNorm(0.5)) < 1e-9);
  assert.ok(Math.abs(T.util.invNorm(0.95) - 1.6449) < 1e-3);
  assert.ok(Math.abs(T.util.invNorm(0.99) - 2.3263) < 1e-3);
});

test('great-circle distance: Mumbai to Delhi is about 1,150 km', () => {
  const d = T.util.haversine({ lat: 19.076, lon: 72.8777 }, { lat: 28.7041, lon: 77.1025 });
  assert.ok(d > 1100 && d < 1200, `got ${d}`);
});

test('season shapes average to exactly 1', () => {
  for (const p of data.products) {
    const s = T.seasonShape(p);
    assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) / 52 - 1) < 1e-9, p.name);
  }
});

test('min-cost flow: cheap arc fills first, rest goes the expensive way', () => {
  const g = new T.MCF(4);
  const cheap = g.add(0, 1, 5, 1), dear = g.add(0, 2, 10, 3);
  g.add(1, 3, 8, 0); g.add(2, 3, 8, 0);
  assert.equal(g.run(0, 3, 8), 8);
  assert.equal(g.flow(cheap), 5);
  assert.equal(g.flow(dear), 3);
});

test('smart forecast beats "same week last year" on every product', () => {
  for (const p of data.products) {
    const m = fc.products[p.id];
    assert.ok(m.wmape.smart < m.wmape.naive, `${p.name}: ${m.wmape.smart} vs ${m.wmape.naive}`);
  }
});

test('cost components add up to the total', () => {
  const sum = Object.values(base.comp).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - base.total) < 1);
});

test('exhaustive search returns the true cheapest design (brute-force check)', () => {
  const locks = { D4: 'closed', D6: 'closed', D7: 'closed', D8: 'closed', D9: 'closed' };
  const L2 = { ...L, locks };
  const r = T.optimize(data, fc, L2);
  const pp = T.prepare(data, fc, L2);
  const free = data.dcs.map((d, j) => j).filter(j => !locks[data.dcs[j].id]);
  let best = Infinity;
  for (let m = 1; m < 1 << free.length; m++) {
    const open = free.filter((_, b) => m & (1 << b));
    best = Math.min(best, T.evaluate(pp, open, false).total);
  }
  assert.ok(Math.abs(r.total - best) < 1, `${r.total} vs ${best}`);
});

test('pooling: safety stock in DCs is below city-by-city buffers', () => {
  assert.ok(base.kpi.ssValue < base.kpi.decentralSS);
});

test('dearer freight never makes the plan cheaper', () => {
  assert.ok(T.optimize(data, fc, { ...L, freightIndex: 1.2 }).total > base.total);
});

test('higher service target holds more safety stock', () => {
  const hi = T.optimize(data, fc, { ...L, serviceLevel: 0.99 });
  assert.ok(hi.kpi.ssValue > base.kpi.ssValue);
});

test('simulation agrees with the inventory formulas within 5% and meets the target', () => {
  const s = T.simulate(data, fc, L, base, { reps: 30 });
  const formula = base.kpi.ssValue + base.kpi.cycleValue;
  assert.ok(Math.abs(s.avgInventory - formula) / formula < 0.05, `${s.avgInventory} vs ${formula}`);
  assert.ok(s.fillRate >= L.serviceLevel);
});

test('rerouting during a plant outage protects fill rate', () => {
  const outage = { plantId: 'P3', startWeek: 10, weeks: 4 };
  const reroute = T.simulate(data, fc, { ...L, outage, reroute: true }, base, { reps: 20 });
  const wait = T.simulate(data, fc, { ...L, outage, reroute: false }, base, { reps: 20 });
  assert.ok(reroute.fillRate > wait.fillRate);
});

test('a backup plant can only reroute what it has spare', () => {
  const lv = { ...L, outage: { plantId: 'P3', startWeek: 10, weeks: 4 }, reroute: true };
  const flow = {}; for (const l of base.primaryLanes) flow[l.from] = (flow[l.from] || 0) + l.slotsWk;
  // give every other plant exactly `lu` of spare capacity a week over what it already ships
  const spare = (lu) => ({ ...data, plants: data.plants.map(p => p.id === 'P3' ? p : { ...p, capacity: (flow[p.id] || 0) + lu }) });
  const run = (d, extra) => T.simulate(d, fc, { ...lv, ...extra }, base, { reps: 20 });
  const roomy = run(data), tight = run(spare(1000)), none = run(spare(0)), wait = run(data, { reroute: false });
  // no spare capacity: every order waits for the restart, exactly as with rerouting off
  assert.equal(none.fillRate, wait.fillRate);
  assert.equal(none.rerouted, 0);
  assert.ok(wait.fillRate < tight.fillRate && tight.fillRate < roomy.fillRate, `${wait.fillRate} < ${tight.fillRate} < ${roomy.fillRate}`);
});

test('outage reroute volume and extra freight are averages over all runs', () => {
  const lv = { ...L, outage: { plantId: 'P3', startWeek: 10, weeks: 4 }, reroute: true };
  const one = T.simulate(data, fc, lv, base, { reps: 1 }), many = T.simulate(data, fc, lv, base, { reps: 20 });
  // run 1 is the same in both, so equal numbers would mean only run 1 was counted
  assert.notEqual(many.rerouted, one.rerouted);
  assert.notEqual(many.expediteCost, one.expediteCost);
  // and an average stays on the scale of a single run, where a sum would be 20 times bigger
  assert.ok(Math.abs(many.rerouted / one.rerouted - 1) < 0.25, `${many.rerouted} vs ${one.rerouted}`);
  assert.ok(Math.abs(many.expediteCost / one.expediteCost - 1) < 0.25, `${many.expediteCost} vs ${one.expediteCost}`);
});
