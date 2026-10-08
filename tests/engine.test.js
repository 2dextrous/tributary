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

test('forecast errors and σ are out of sample: a week never helps forecast itself', () => {
  const H = data.meta.weeksHistory, s = fc.series['C1|K1'], y = data.history.C1.K1;
  // σ is the root mean square of the scored one-week-ahead errors
  let e2 = 0, n = 0;
  for (let t = fc.evalFrom; t < H; t++) { const e = y[t] - s.pred.smart[t]; e2 += e * e; n++; }
  assert.ok(Math.abs(Math.sqrt(e2 / n) - s.sigma.smart) < 1e-9);
  // change the last week's actual: its forecast must not move, only its error
  const d2 = JSON.parse(JSON.stringify(data)); d2.history.C1.K1[H - 1] += 500;
  const s2 = T.forecast(d2).series['C1|K1'];
  assert.equal(s2.pred.smart[H - 1], s.pred.smart[H - 1]);
  assert.ok(s2.sigma.smart > s.sigma.smart);
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

test('pooling compares like with like: city buffers get the same z and L + R as their DC', () => {
  const pp = T.prepare(data, fc, { ...L, handlingDays: 10 }), r = T.evaluate(pp, base.open, true);
  assert.ok(r.dcs.every(d => d.L + d.R !== 2)); // so a fixed √2 protection period would be wrong
  let expected = 0;
  for (const d of r.dcs) data.products.forEach((p, k) => {
    let sdSum = 0; // standard deviations add, share by share, when nothing is pooled
    for (const l of r.secondaryLanes) if (l.from === d.id) { const i = data.customers.findIndex(c => c.id === l.to); sdSum += l.slotsWk / pp.slots[i] * pp.sig[i][k]; }
    expected += pp.z * sdSum * Math.sqrt(d.L + d.R) * p.value;
  });
  assert.ok(Math.abs(r.kpi.decentralSS / expected - 1) < 1e-9, `${r.kpi.decentralSS} vs ${expected}`);
  assert.ok(r.kpi.ssValue < r.kpi.decentralSS);
});

test('dearer freight never makes the plan cheaper', () => {
  assert.ok(T.optimize(data, fc, { ...L, freightIndex: 1.2 }).total > base.total);
});

test('higher service target holds more safety stock', () => {
  const hi = T.optimize(data, fc, { ...L, serviceLevel: 0.99 });
  assert.ok(hi.kpi.ssValue > base.kpi.ssValue);
});

test('simulation agrees with the inventory formulas: stock within 5%, stockouts as the cycle service level predicts', () => {
  const s = T.simulate(data, fc, L, base, { reps: 30 });
  const formula = base.kpi.ssValue + base.kpi.cycleValue;
  assert.ok(Math.abs(s.avgInventory - formula) / formula < 0.05, `${s.avgInventory} vs ${formula}`);
  // the lever is a cycle service level, not a fill rate: each order cycle runs short with chance 1 − target
  let short = 0, expected = 0;
  s.perDC.forEach((d, o) => d.skus.forEach(x => { short += x.stockoutWeeks; expected += 52 / base.dcs[o].R * (1 - L.serviceLevel); }));
  assert.ok(Math.abs(short / expected - 1) < 0.25, `${short} weeks short vs ${expected} expected`);
});

test('rerouting during a plant outage protects fill rate', () => {
  const outage = { plantId: 'P3', startWeek: 10, weeks: 4 };
  const reroute = T.simulate(data, fc, { ...L, outage, reroute: true }, base, { reps: 20 });
  const wait = T.simulate(data, fc, { ...L, outage, reroute: false }, base, { reps: 20 });
  assert.ok(reroute.fillRate > wait.fillRate);
});

test('a backup plant can only reroute what it has spare', () => {
  const lv = { ...L, outage: { plantId: 'P3', startWeek: 10, weeks: 4 }, reroute: true };
  const load = {}; for (const d of base.dcs) load[d.primaryPlant] = (load[d.primaryPlant] || 0) + d.throughput;
  // give every other plant exactly `lu` of spare capacity a week over what its own DCs take
  const spare = (lu) => ({ ...data, plants: data.plants.map(p => p.id === 'P3' ? p : { ...p, capacity: (load[p.id] || 0) + lu }) });
  const run = (d, extra) => T.simulate(d, fc, { ...lv, ...extra }, base, { reps: 20 });
  const roomy = run(data), tight = run(spare(1000)), none = run(spare(0)), wait = run(data, { reroute: false });
  // no spare capacity: every order waits for the restart, exactly as with rerouting off
  assert.equal(none.fillRate, wait.fillRate);
  assert.equal(none.rerouted, 0);
  assert.ok(wait.fillRate < tight.fillRate && tight.fillRate < roomy.fillRate, `${wait.fillRate} < ${tight.fillRate} < ${roomy.fillRate}`);
});

test('when the cheapest backup plant is full, rerouted orders try the next one', () => {
  const lv = { ...L, outage: { plantId: 'P3', startWeek: 10, weeks: 4 }, reroute: true };
  const load = base.dcs.filter(d => d.primaryPlant === 'P1').reduce((a, d) => a + d.throughput, 0);
  const p1Full = { ...data, plants: data.plants.map(p => p.id === 'P1' ? { ...p, capacity: load } : p) };
  const fillAt = (s, id) => s.perDC.find(d => d.id === id).skus.reduce((a, x) => a + x.fill, 0);
  const s = T.simulate(p1Full, fc, lv, base, { reps: 20 }), wait = T.simulate(data, fc, { ...lv, reroute: false }, base, { reps: 20 });
  // Gurugram's cheapest backup, Pune, has nothing spare, so its orders go on to Sriperumbudur instead of all waiting
  assert.ok(fillAt(s, 'D2') > fillAt(wait, 'D2'), `${fillAt(s, 'D2')} vs ${fillAt(wait, 'D2')}`);
});

test("a DC supplied by two plants keeps its backup plant's existing share during an outage", () => {
  const d = T.defaultData();
  d.plants = [{ id: 'A', name: 'A', lat: 19.0, lon: 73.0, capacity: 60, varCost: 30 }, { id: 'B', name: 'B', lat: 19.5, lon: 73.5, capacity: 60, varCost: 40 }];
  d.dcs = [{ id: 'X', name: 'X', lat: 19.2, lon: 73.2, fixedCost: 1e6, capacity: 1000, handling: 10 }];
  d.customers = [{ id: 'C', name: 'C', lat: 19.25, lon: 73.25, weight: 1 }];
  d.products = [{ id: 'K', name: 'K', value: 100000, cube: 1, baseWeekly: 100, cv: 0.001, season: 'none', amp: 0, trend: 0,
    northBias: 1, returnRate: 0, refurbShare: 0, recovery: 0, processing: 0 }];
  const f = T.forecast(d), lv = T.defaultLevers(), net = T.optimize(d, f, lv);
  // design: A ships 60 a week and B ships 40 to X, whose main plant is A
  assert.equal(net.dcs[0].primaryPlant, 'A');
  const s = T.simulate(d, f, { ...lv, outage: { plantId: 'A', startWeek: 10, weeks: 6 }, reroute: true }, net, { reps: 5 });
  // B can make 60 a week; with A down, all of it can go to X, so X gets 60 of its 100 a week
  for (const w of s.fill.slice(12, 15)) assert.ok(Math.abs(w.p50 - 0.6) < 0.03, `${w.p50}`);
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
