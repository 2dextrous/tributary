/* Engine host. The page runs the engine through this host, normally inside a Web Worker that app.js builds
   from this page's own engine and host scripts, so a long solve never freezes the page.
   Only plain data can cross between the page and a worker, so the host keeps what cannot: the loaded data,
   its forecast (which carries helper functions) and each design's lane costs, pp (which holds both). It
   rebuilds pp from a design's levers when it needs it again, and sends back only what the page renders. */
(function (root) {
  'use strict';

  function createHost(T) {
    let data = null, fc = null;
    const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    function loaded() { if (!fc) throw new Error('the engine has no data yet'); }
    // the forecast without its helper functions: series, accuracy and seasonality are plain numbers
    function plainForecast(f) {
      const out = {};
      for (const k of Object.keys(f)) if (typeof f[k] !== 'function') out[k] = f[k];
      return out;
    }
    // an optimize result with pp cut down to mu, the weekly demand per demand point and product the map shows
    const view = (r) => Object.assign({}, r, { pp: { mu: r.pp.mu } });
    function cheapest(levers) {
      const r = T.optimize(data, fc, levers);
      if (!r) throw new Error('every DC is locked closed');
      return r;
    }
    // safety stock and holding cost of this design planned on each forecast method, for the Forecast tab
    function forecastValue(levers, open) {
      const run = (method) => T.evaluate(T.prepare(data, fc, Object.assign({}, levers, { forecastMethod: method })), open, true);
      const a = run('smart'), b = run('naive');
      return { ssSmart: a.kpi.ssValue, ssNaive: b.kpi.ssValue, holdSmart: a.comp.holding, holdNaive: b.comp.holding };
    }
    return {
      // keep the data and forecast it; forecast() fills in missing demand history, so the history goes back too
      load({ data: d }) {
        data = d; fc = T.forecast(data);
        return { fc: plainForecast(fc), history: data.history };
      },
      // the cheapest design for these levers, then a simulated year of it
      scenario({ levers, reps }) {
        loaded();
        const t0 = clock(), r = cheapest(levers), sim = T.simulate(data, fc, levers, r, { reps });
        const res = view(r);
        res.forecastValue = forecastValue(levers, r.open);
        return { res, sim, ms: clock() - t0 };
      },
      // simulate a design solved earlier: its pp is rebuilt from the levers it was solved with
      simulate({ levers, res, reps }) {
        loaded();
        const net = Object.assign({}, res, { pp: T.prepare(data, fc, res.levers) });
        return { sim: T.simulate(data, fc, levers, net, { reps }) };
      },
      // the cheapest design only, for sweeps
      optimize({ levers }) {
        loaded();
        return { res: view(cheapest(levers)) };
      }
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = createHost;
  else root.TRIB_HOST = createHost;

  // inside a Web Worker: answer the page's requests one at a time, in the order they arrive
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
    const host = createHost(root.TRIB);
    root.onmessage = (e) => {
      const { id, cmd, args } = e.data || {};
      try {
        if (!Object.prototype.hasOwnProperty.call(host, cmd)) throw new Error('unknown engine request: ' + cmd);
        root.postMessage({ id, ok: true, value: host[cmd](args || {}) });
      } catch (err) {
        root.postMessage({ id, ok: false, error: String((err && err.message) || err) });
      }
    };
    root.postMessage({ ready: true });
  }
})(typeof window !== 'undefined' ? window : globalThis);
