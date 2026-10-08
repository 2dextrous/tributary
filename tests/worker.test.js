// The engine host behind the page's Web Worker. Run: npm test
// Whatever it sends back must survive a structured clone, and must match calling the engine directly.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/engine.js');
const createHost = require('../src/worker.js');

const host = createHost(T);
const loaded = host.load({ data: T.defaultData() });
// the same model, run straight through the engine
const data = T.defaultData();
const fc = T.forecast(data);
const L = T.defaultLevers();
const direct = T.optimize(data, fc, L);
const directSim = T.simulate(data, fc, L, direct, { reps: 30 });
const out = host.scenario({ levers: L, reps: 30 });

test('host: every reply survives the copy to and from a worker', () => {
  // structuredClone throws on functions, which is what forecast() and pp carry
  for (const reply of [loaded, out, host.simulate({ levers: L, res: out.res, reps: 10 }), host.optimize({ levers: L })]) {
    assert.doesNotThrow(() => structuredClone(reply));
  }
  assert.equal(typeof fc.woyF, 'function');
  assert.ok(!('woyF' in loaded.fc) && !('woyH' in loaded.fc));
});

test('host: forecast and history match the engine', () => {
  assert.deepEqual(loaded.history, data.history);
  const k = data.customers[0].id + '|' + data.products[0].id;
  assert.deepEqual(loaded.fc.series[k].fc.smart, fc.series[k].fc.smart);
  assert.equal(loaded.fc.series[k].sigma.smart, fc.series[k].sigma.smart);
  assert.deepEqual(loaded.fc.products, fc.products);
});

test('host: a scenario matches optimize and simulate called directly', () => {
  assert.equal(out.res.total, direct.total);
  assert.deepEqual(out.res.open, direct.open);
  assert.deepEqual(out.res.comp, direct.comp);
  assert.deepEqual(out.res.kpi, direct.kpi);
  assert.deepEqual(out.res.alternatives, direct.alternatives);
  assert.equal(out.sim.fillRate, directSim.fillRate);
  assert.deepEqual(out.sim.inv, directSim.inv);
  assert.ok(out.ms >= 0);
});

test('host: pp stays behind except mu, the demand the map tooltip shows', () => {
  assert.deepEqual(Object.keys(out.res.pp), ['mu']);
  assert.deepEqual(out.res.pp.mu, direct.pp.mu);
});

test('host: re-simulating a solved design matches the engine', () => {
  // an outage only changes the simulation, so the page re-simulates the design it already has
  const L2 = Object.assign({}, L, { outage: { plantId: data.plants[0].id, startWeek: 10, weeks: 4 } });
  const res = structuredClone(out.res);
  const again = host.simulate({ levers: L2, res, reps: 30 }).sim;
  const want = T.simulate(data, fc, L2, direct, { reps: 30 });
  assert.equal(again.fillRate, want.fillRate);
  assert.equal(again.rerouted, want.rerouted);
  assert.equal(again.expediteCost, want.expediteCost);
  assert.ok(again.rerouted > 0, 'the outage reroutes some volume');
});

test('host: forecast value is the design costed on each forecast method', () => {
  const on = (m) => T.evaluate(T.prepare(data, fc, Object.assign({}, L, { forecastMethod: m })), direct.open, true);
  const a = on('smart'), b = on('naive');
  assert.deepEqual(out.res.forecastValue, { ssSmart: a.kpi.ssValue, ssNaive: b.kpi.ssValue, holdSmart: a.comp.holding, holdNaive: b.comp.holding });
});

test('host: a sweep point matches optimize', () => {
  const L2 = Object.assign({}, L, { freightIndex: 1.4 });
  const r = host.optimize({ levers: L2 }).res, want = T.optimize(data, fc, L2);
  assert.equal(r.total, want.total);
  assert.deepEqual(r.open, want.open);
});

test('host: asks for data first, and says why no network is possible', () => {
  assert.throws(() => createHost(T).scenario({ levers: L, reps: 10 }), /no data/);
  const closed = Object.assign({}, L, { locks: Object.fromEntries(data.dcs.map(d => [d.id, 'closed'])) });
  assert.throws(() => host.optimize({ levers: closed }), /locked closed/);
});
