(function (root) {
  'use strict';
  const T = {};

  /* ---------------- utilities ---------------- */
  function rngFrom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normalFrom(rng) {
    let spare = null;
    return function () {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u, v, s;
      do { u = rng() * 2 - 1; v = rng() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
      const m = Math.sqrt(-2 * Math.log(s) / s);
      spare = v * m; return u * m;
    };
  }
  function invNorm(p) {
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    const pl = 0.02425, ph = 1 - pl; let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p <= ph) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  function haversine(a, b) {
    const R = 6371, k = Math.PI / 180;
    const dLat = (b.lat - a.lat) * k, dLon = (b.lon - a.lon) * k;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  const mod52 = (x) => ((x % 52) + 52) % 52;
  function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  T.util = { rngFrom, normalFrom, invNorm, haversine, mod52, quantile };

  /* ---------------- city library (for adding nodes) ---------------- */
  T.CITIES = [
    ['Agra', 27.1767, 78.0081], ['Ahmedabad', 23.0225, 72.5714], ['Amritsar', 31.634, 74.8723], ['Aurangabad', 19.8762, 75.3433],
    ['Bengaluru', 12.9716, 77.5946], ['Bhiwandi', 19.2813, 73.0483], ['Bhopal', 23.2599, 77.4126], ['Bhubaneswar', 20.2961, 85.8245],
    ['Chandigarh', 30.7333, 76.7794], ['Chennai', 13.0827, 80.2707], ['Coimbatore', 11.0168, 76.9558], ['Cuttack', 20.4625, 85.883],
    ['Dehradun', 30.3165, 78.0322], ['Delhi', 28.7041, 77.1025], ['Dhanbad', 23.7957, 86.4304], ['Durgapur', 23.5204, 87.3119],
    ['Faridabad', 28.4089, 77.3178], ['Gandhinagar', 23.2156, 72.6369], ['Goa (Panaji)', 15.4909, 73.8278], ['Gorakhpur', 26.7606, 83.3732],
    ['Gurugram', 28.4595, 77.0266], ['Guwahati', 26.1445, 91.7362], ['Gwalior', 26.2183, 78.1828], ['Hosur', 12.7409, 77.8253],
    ['Hubballi', 15.3647, 75.124], ['Hyderabad', 17.385, 78.4867], ['Indore', 22.7196, 75.8577], ['Jabalpur', 23.1815, 79.9864],
    ['Jaipur', 26.9124, 75.7873], ['Jalandhar', 31.326, 75.5762], ['Jammu', 32.7266, 74.857], ['Jamshedpur', 22.8046, 86.2029],
    ['Jodhpur', 26.2389, 73.0243], ['Kanpur', 26.4499, 80.3319], ['Kochi', 9.9312, 76.2673], ['Kolhapur', 16.705, 74.2433],
    ['Kolkata', 22.5726, 88.3639], ['Kota', 25.2138, 75.8648], ['Kozhikode', 11.2588, 75.7804], ['Lucknow', 26.8467, 80.9462],
    ['Ludhiana', 30.901, 75.8573], ['Madurai', 9.9252, 78.1198], ['Mangaluru', 12.9141, 74.856], ['Manesar', 28.354, 76.94],
    ['Meerut', 28.9845, 77.7064], ['Mumbai', 19.076, 72.8777], ['Mysuru', 12.2958, 76.6394], ['Nagpur', 21.1458, 79.0882],
    ['Nashik', 19.9975, 73.7898], ['Noida', 28.5355, 77.391], ['Patna', 25.5941, 85.1376], ['Pune', 18.5204, 73.8567],
    ['Raipur', 21.2514, 81.6296], ['Rajkot', 22.3039, 70.8022], ['Ranchi', 23.3441, 85.3096], ['Salem', 11.6643, 78.146],
    ['Sanand', 22.992, 72.38], ['Siliguri', 26.7271, 88.3953], ['Sriperumbudur', 12.9675, 79.9419], ['Surat', 21.1702, 72.8311],
    ['Thane', 19.2183, 72.9781], ['Thiruvananthapuram', 8.5241, 76.9366], ['Tiruchirappalli', 10.7905, 78.7047], ['Udaipur', 24.5854, 73.7125],
    ['Vadodara', 22.3072, 73.1812], ['Varanasi', 25.3176, 82.9739], ['Vijayawada', 16.5062, 80.648], ['Visakhapatnam', 17.6868, 83.2185],
    ['Warangal', 17.9689, 79.5941]
  ].map(([name, lat, lon]) => ({ name, lat, lon }));

  /* ---------------- default dataset ---------------- */
  T.defaultData = function () {
    const cr = 1e7;
    const plants = [
      { id: 'P1', name: 'Pune', lat: 18.5204, lon: 73.8567, capacity: 9000, varCost: 30 },
      { id: 'P2', name: 'Sriperumbudur', lat: 12.9675, lon: 79.9419, capacity: 8500, varCost: 27 },
      { id: 'P3', name: 'Manesar', lat: 28.354, lon: 76.94, capacity: 8500, varCost: 33 }
    ];
    const dcs = [
      { id: 'D1', name: 'Bhiwandi', lat: 19.2813, lon: 73.0483, fixedCost: 2.6 * cr, capacity: 6500, handling: 20 },
      { id: 'D2', name: 'Gurugram', lat: 28.4595, lon: 77.0266, fixedCost: 2.8 * cr, capacity: 7000, handling: 21 },
      { id: 'D3', name: 'Hosur', lat: 12.7409, lon: 77.8253, fixedCost: 2.3 * cr, capacity: 6000, handling: 19 },
      { id: 'D4', name: 'Hyderabad', lat: 17.385, lon: 78.4867, fixedCost: 1.9 * cr, capacity: 5000, handling: 17 },
      { id: 'D5', name: 'Kolkata', lat: 22.5726, lon: 88.3639, fixedCost: 2.0 * cr, capacity: 4500, handling: 18 },
      { id: 'D6', name: 'Nagpur', lat: 21.1458, lon: 79.0882, fixedCost: 1.4 * cr, capacity: 6000, handling: 15 },
      { id: 'D7', name: 'Lucknow', lat: 26.8467, lon: 80.9462, fixedCost: 1.5 * cr, capacity: 4500, handling: 16 },
      { id: 'D8', name: 'Ahmedabad', lat: 23.0225, lon: 72.5714, fixedCost: 1.7 * cr, capacity: 4500, handling: 17 },
      { id: 'D9', name: 'Guwahati', lat: 26.1445, lon: 91.7362, fixedCost: 1.1 * cr, capacity: 2500, handling: 18 }
    ];
    const cust = [
      ['Mumbai', 10], ['Delhi', 10], ['Bengaluru', 8], ['Hyderabad', 7], ['Ahmedabad', 5], ['Chennai', 7], ['Kolkata', 7],
      ['Surat', 4], ['Pune', 5], ['Jaipur', 4], ['Lucknow', 4], ['Kanpur', 3], ['Nagpur', 3], ['Indore', 3], ['Bhopal', 2.5],
      ['Visakhapatnam', 2.5], ['Patna', 3], ['Vadodara', 2.5], ['Ludhiana', 2.5], ['Agra', 2], ['Coimbatore', 2.5], ['Kochi', 2.5],
      ['Thiruvananthapuram', 2], ['Madurai', 2], ['Vijayawada', 2], ['Bhubaneswar', 2], ['Raipur', 2], ['Ranchi', 1.8],
      ['Guwahati', 2], ['Chandigarh', 2.5], ['Dehradun', 1.5], ['Varanasi', 2], ['Jodhpur', 1.5], ['Amritsar', 1.8],
      ['Mysuru', 1.5], ['Mangaluru', 1.5], ['Goa (Panaji)', 1.2], ['Rajkot', 1.8], ['Aurangabad', 1.5], ['Jabalpur', 1.5],
      ['Siliguri', 1.2], ['Hubballi', 1.2]
    ];
    const lib = Object.fromEntries(T.CITIES.map(c => [c.name, c]));
    const customers = cust.map(([name, w], i) => ({ id: 'C' + (i + 1), name, lat: lib[name].lat, lon: lib[name].lon, weight: w }));
    const products = [
      { id: 'K1', name: 'Inverter AC', value: 32000, cube: 3.0, baseWeekly: 2400, cv: 0.45, season: 'summer', amp: 1.4, trend: 0.12, northBias: 1.0,
        returnRate: 0.015, refurbShare: 0.7, recovery: 0.55, processing: 1500 },
      { id: 'K2', name: 'Air purifier', value: 12000, cube: 1.0, baseWeekly: 3800, cv: 0.5, season: 'winter', amp: 1.8, trend: 0.15, northBias: 1.8,
        returnRate: 0.035, refurbShare: 0.7, recovery: 0.5, processing: 600 },
      { id: 'K3', name: 'Ceiling fan', value: 3800, cube: 0.6, baseWeekly: 9000, cv: 0.35, season: 'summer', amp: 0.7, trend: 0.06, northBias: 1.0,
        returnRate: 0.02, refurbShare: 0.5, recovery: 0.3, processing: 180 }
    ];
    return {
      version: 1,
      meta: { name: 'Home appliances, India', weeksHistory: 104, historyEndWoy: 40, seed: 20261008, historySource: 'synthetic' },
      plants, dcs, customers, products,
      returnsHub: { name: 'Nagpur returns hub', lat: 20.95, lon: 79.0 },
      costs: {
        ftlPerKm: 58, truckCapacity: 900, targetFill: 0.85, ltlPerSlotKm: 0.45, dropPerSlot: 25, roadFactor: 1.25,
        speedKmDay: 420, orderCost: 15000, lostSalePenalty: 5000, reversePremium: 1.3, co2PerTruckKm: 0.95, ltlCo2Factor: 2.2
      },
      history: null
    };
  };

  T.defaultLevers = function () {
    return {
      holdingRate: 0.24, freightIndex: 1.0, demandGrowth: 0, serviceLevel: 0.95, dcFixedIndex: 1.0, returnIndex: 1.0,
      forecastMethod: 'smart', handlingDays: 3, maxServiceKm: 1500, seasonalBuffers: true,
      outage: { plantId: '', startWeek: 20, weeks: 4 }, reroute: true, locks: {}
    };
  };

  /* ---------------- seasonality & synthetic history ---------------- */
  T.seasonShape = function (product) {
    const s = new Float64Array(52);
    const cfg = { summer: [16, 5.5], winter: [49, 4.5], festive: [43, 2.5], monsoon: [29, 4.5] }[product.season];
    for (let w = 0; w < 52; w++) {
      let g = 0;
      if (cfg) { let d = Math.abs(w - cfg[0]); d = Math.min(d, 52 - d); g = Math.exp(-(d * d) / (2 * cfg[1] * cfg[1])); }
      s[w] = 1 + (product.amp || 0) * g;
    }
    let m = 0; for (let w = 0; w < 52; w++) m += s[w]; m /= 52;
    for (let w = 0; w < 52; w++) s[w] /= m;
    return s;
  };

  T.customerShares = function (data, product) {
    const raw = data.customers.map(c => c.weight * (c.lat > 24 ? (product.northBias || 1) : (product.northBias > 1 ? 0.75 : 1)));
    const tot = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map(r => r / tot);
  };

  T.generateHistory = function (data) {
    const H = data.meta.weeksHistory, endW = data.meta.historyEndWoy;
    const rng = rngFrom(data.meta.seed), norm = normalFrom(rng);
    const maxW = Math.max(...data.customers.map(c => c.weight));
    const hist = {};
    for (const c of data.customers) hist[c.id] = {};
    for (const p of data.products) {
      const s = T.seasonShape(p), shares = T.customerShares(data, p);
      data.customers.forEach((c, i) => {
        const cv = p.cv * (0.8 + 0.6 * (1 - c.weight / maxW));
        const y = new Array(H);
        for (let t = 0; t < H; t++) {
          const w = mod52(endW - (H - 1) + t);
          const level = p.baseWeekly * shares[i] * (1 + p.trend * (t - (H - 1)) / 52);
          const mu = Math.max(0, level * s[w]);
          y[t] = Math.max(0, Math.round(mu * (1 + cv * norm())));
        }
        hist[c.id][p.id] = y;
      });
    }
    return hist;
  };

  T.ensureHistory = function (data) {
    if (!data.history) data.history = T.generateHistory(data);
    for (const c of data.customers) {
      if (!data.history[c.id]) data.history[c.id] = {};
      for (const p of data.products) {
        const y = data.history[c.id][p.id];
        if (!y || y.length !== data.meta.weeksHistory) {
          // generate a fresh synthetic series for any new node or product
          const tmp = JSON.parse(JSON.stringify({ ...data, history: null, customers: [c], products: [p] }));
          tmp.meta.seed = (data.meta.seed + c.id.length * 7919 + p.id.length * 104729 + hashStr(c.id + p.id)) >>> 0;
          const shareFix = c.weight / (data.customers.reduce((a, x) => a + x.weight, 0) || 1);
          tmp.products[0].baseWeekly = p.baseWeekly * shareFix;
          data.history[c.id][p.id] = T.generateHistory(tmp)[c.id][p.id];
        }
      }
    }
    return data;
  };
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ---------------- forecasting ---------------- */
  const PHI = 0.98;
  function holtRun(y, s, woyH, alpha, beta, H, collect) {
    const d0 = []; for (let t = 0; t < 8; t++) d0.push(y[t] / Math.max(s[woyH(t)], 0.05));
    let l = d0.reduce((a, b) => a + b, 0) / 8, b = 0, sse = 0;
    const pred = collect ? new Float64Array(H) : null;
    for (let t = 0; t < H; t++) {
      const st = Math.max(s[woyH(t)], 0.05);
      const p = Math.max(0, (l + PHI * b) * st);
      const e = y[t] - p;
      if (t >= 13) sse += e * e;
      if (collect) pred[t] = p;
      const dt = y[t] / st;
      const ln = alpha * dt + (1 - alpha) * (l + PHI * b);
      b = beta * (ln - l) + (1 - beta) * PHI * b;
      l = ln;
    }
    return { l, b, sse, pred };
  }

  T.forecast = function (data) {
    T.ensureHistory(data);
    const H = data.meta.weeksHistory, endW = data.meta.historyEndWoy;
    const woyH = (t) => mod52(endW - (H - 1) + t);
    const woyF = (h) => mod52(endW + 1 + h);
    const evalFrom = Math.max(13, H - 52);
    const res = { series: {}, products: {}, seasonal: {}, woyF, woyH, evalFrom };
    for (const p of data.products) {
      const A = new Float64Array(H);
      for (const c of data.customers) { const y = data.history[c.id][p.id]; for (let t = 0; t < H; t++) A[t] += y[t]; }
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let t = 0; t < H; t++) { sx += t; sy += A[t]; sxx += t * t; sxy += t * A[t]; }
      const slope = (H * sxy - sx * sy) / (H * sxx - sx * sx || 1), icpt = (sy - slope * sx) / H;
      const rs = new Float64Array(52), rc = new Float64Array(52);
      for (let t = 0; t < H; t++) { const tr = icpt + slope * t; if (tr > 0) { rs[woyH(t)] += A[t] / tr; rc[woyH(t)]++; } }
      const raw = new Float64Array(52); for (let w = 0; w < 52; w++) raw[w] = rc[w] ? rs[w] / rc[w] : 1;
      const s = new Float64Array(52), wts = [1, 2, 3, 2, 1];
      for (let w = 0; w < 52; w++) { let acc = 0; for (let k = -2; k <= 2; k++) acc += wts[k + 2] * raw[mod52(w + k)]; s[w] = acc / 9; }
      let m = 0; for (let w = 0; w < 52; w++) m += s[w]; m /= 52; for (let w = 0; w < 52; w++) s[w] /= m;
      res.seasonal[p.id] = s;

      let absS = 0, absN = 0, sumY = 0, biasS = 0, biasN = 0;
      for (const c of data.customers) {
        const y = data.history[c.id][p.id];
        let best = null;
        for (const a of [0.05, 0.1, 0.2, 0.35]) for (const bt of [0, 0.03, 0.08]) {
          const r = holtRun(y, s, woyH, a, bt, H, false);
          if (!best || r.sse < best.sse) best = { a, bt, sse: r.sse };
        }
        const run = holtRun(y, s, woyH, best.a, best.bt, H, true);
        const fcS = new Float64Array(52), fcN = new Float64Array(52);
        let cum = 0, ph = 1;
        for (let h = 0; h < 52; h++) { ph *= PHI; cum += ph; fcS[h] = Math.max(0, (run.l + cum * run.b) * s[woyF(h)]); fcN[h] = y[H - 52 + h]; }
        let eS2 = 0, eN2 = 0, n = 0, aS = 0, aN = 0, bS = 0, bN = 0, yy = 0;
        const predN = new Float64Array(H);
        for (let t = 0; t < H; t++) predN[t] = t >= 52 ? y[t - 52] : NaN;
        for (let t = evalFrom; t < H; t++) {
          const es = y[t] - run.pred[t], en = y[t] - predN[t];
          eS2 += es * es; eN2 += en * en; n++; aS += Math.abs(es); aN += Math.abs(en); bS += -es; bN += -en; yy += y[t];
        }
        const key = c.id + '|' + p.id;
        res.series[key] = {
          fc: { smart: fcS, naive: fcN },
          sigma: { smart: Math.sqrt(eS2 / Math.max(1, n)), naive: Math.sqrt(eN2 / Math.max(1, n)) },
          wmape: { smart: yy ? aS / yy : 0, naive: yy ? aN / yy : 0 },
          bias: { smart: yy ? bS / yy : 0, naive: yy ? bN / yy : 0 },
          pred: { smart: run.pred, naive: predN },
          params: { alpha: best.a, beta: best.bt }
        };
        absS += aS; absN += aN; sumY += yy; biasS += bS; biasN += bN;
      }
      res.products[p.id] = {
        wmape: { smart: sumY ? absS / sumY : 0, naive: sumY ? absN / sumY : 0 },
        bias: { smart: sumY ? biasS / sumY : 0, naive: sumY ? biasN / sumY : 0 },
        fva: absN ? 1 - absS / absN : 0
      };
    }
    return res;
  };

  /* ---------------- min-cost flow (successive shortest paths, dense Dijkstra) ---------------- */
  function MCF(n) { this.n = n; this.head = new Int32Array(n).fill(-1); this.to = []; this.cap = []; this.cost = []; this.nxt = []; this.orig = []; }
  MCF.prototype.add = function (u, v, cap, cost) {
    const e = this.to.length;
    this.to.push(v, u); this.cap.push(cap, 0); this.cost.push(cost, -cost); this.orig.push(cap, 0);
    this.nxt.push(this.head[u], this.head[v]); this.head[u] = e; this.head[v] = e + 1;
    return e;
  };
  MCF.prototype.run = function (s, t, need) {
    const n = this.n, INF = 1e300, h = new Float64Array(n), dist = new Float64Array(n), prevE = new Int32Array(n), done = new Uint8Array(n);
    let sent = 0;
    while (need > 1e-9) {
      dist.fill(INF); done.fill(0); prevE.fill(-1); dist[s] = 0;
      for (let it = 0; it < n; it++) {
        let u = -1, best = INF;
        for (let v = 0; v < n; v++) if (!done[v] && dist[v] < best) { best = dist[v]; u = v; }
        if (u < 0) break; done[u] = 1;
        for (let e = this.head[u]; e !== -1; e = this.nxt[e]) {
          if (this.cap[e] <= 1e-9) continue;
          const v = this.to[e], nd = best + this.cost[e] + h[u] - h[v];
          if (nd < dist[v] - 1e-12) { dist[v] = nd; prevE[v] = e; }
        }
      }
      if (dist[t] >= INF) break;
      for (let v = 0; v < n; v++) if (dist[v] < INF) h[v] += dist[v];
      let f = need, v = t;
      while (v !== s) { const e = prevE[v]; if (this.cap[e] < f) f = this.cap[e]; v = this.to[e ^ 1]; }
      v = t;
      while (v !== s) { const e = prevE[v]; this.cap[e] -= f; this.cap[e ^ 1] += f; v = this.to[e ^ 1]; }
      need -= f; sent += f;
    }
    return sent;
  };
  MCF.prototype.flow = function (e) { return this.orig[e] - this.cap[e]; };
  T.MCF = MCF;

  /* ---------------- network + inventory + transport + returns ---------------- */
  T.prepare = function (data, fc, levers) {
    const C = data.costs, L = levers;
    const method = L.forecastMethod === 'naive' ? 'naive' : 'smart';
    const g = 1 + (L.demandGrowth || 0);
    const P = data.plants, D = data.dcs, Cu = data.customers, K = data.products;
    const road = (a, b) => haversine(a, b) * C.roadFactor;
    const mu = [], sig = [], slots = [];
    Cu.forEach((c, i) => {
      mu[i] = []; sig[i] = []; let sl = 0;
      K.forEach((p, k) => {
        const s = fc.series[c.id + '|' + p.id];
        let a = 0; for (let h = 0; h < 52; h++) a += s.fc[method][h];
        mu[i][k] = a / 52 * g; sig[i][k] = s.sigma[method] * g; sl += mu[i][k] * p.cube;
      });
      slots[i] = sl;
    });
    const kmPD = P.map(p => D.map(d => road(p, d)));
    const kmDC = D.map(d => Cu.map(c => road(d, c)));
    const kmDH = D.map(d => road(d, data.returnsHub));
    const ftlSlot = C.ftlPerKm * L.freightIndex / (C.truckCapacity * C.targetFill);
    const prim = kmPD.map(r => r.map(km => km * ftlSlot));
    const sec = kmDC.map(r => r.map(km => km <= L.maxServiceKm ? (C.ltlPerSlotKm * km + C.dropPerSlot) * L.freightIndex : Infinity));
    const z = invNorm(Math.min(0.9995, Math.max(0.5, L.serviceLevel)));
    return { data, fc, L, C, P, D, Cu, K, method, g, mu, sig, slots, kmPD, kmDC, kmDH, prim, sec, z, ftlSlot };
  };

  T.evaluate = function (pp, openIdx, detail) {
    const { C, L, P, D, Cu, K, mu, sig, slots, kmPD, kmDC, kmDH, prim, sec, z } = pp;
    const nP = P.length, nO = openIdx.length, nC = Cu.length;
    const S = 0, Pn = (p) => 1 + p, In = (o) => 1 + nP + o, Out = (o) => 1 + nP + nO + o, Cn = (i) => 1 + nP + 2 * nO + i, Tn = 1 + nP + 2 * nO + nC;
    const g = new MCF(Tn + 1);
    const ePlant = [], ePD = [], eDC = [], eDCust = [], eUnmet = [];
    const BIG = 1e15;
    for (let p = 0; p < nP; p++) ePlant[p] = g.add(S, Pn(p), Math.max(0, P[p].capacity), P[p].varCost);
    for (let o = 0; o < nO; o++) {
      const j = openIdx[o];
      ePD[o] = []; for (let p = 0; p < nP; p++) ePD[o][p] = g.add(Pn(p), In(o), BIG, prim[p][j]);
      eDC[o] = g.add(In(o), Out(o), Math.max(0, D[j].capacity), D[j].handling);
      eDCust[o] = [];
      for (let i = 0; i < nC; i++) eDCust[o][i] = isFinite(sec[j][i]) ? g.add(Out(o), Cn(i), BIG, sec[j][i]) : -1;
    }
    let need = 0;
    for (let i = 0; i < nC; i++) { g.add(Cn(i), Tn, slots[i], 0); eUnmet[i] = g.add(S, Cn(i), BIG, C.lostSalePenalty); need += slots[i]; }
    g.run(S, Tn, need);

    const fPD = [], gDC = [], thr = [], unmet = [];
    let plantCost = 0, handling = 0, secondary = 0, unmetSlots = 0;
    for (let p = 0; p < nP; p++) plantCost += g.flow(ePlant[p]) * P[p].varCost * 52;
    for (let o = 0; o < nO; o++) {
      const j = openIdx[o];
      fPD[o] = []; for (let p = 0; p < nP; p++) fPD[o][p] = g.flow(ePD[o][p]);
      thr[o] = g.flow(eDC[o]); handling += thr[o] * D[j].handling * 52;
      gDC[o] = []; for (let i = 0; i < nC; i++) { const e = eDCust[o][i]; const f = e >= 0 ? g.flow(e) : 0; gDC[o][i] = f; if (f > 0) secondary += f * sec[j][i] * 52; }
    }
    for (let i = 0; i < nC; i++) { unmet[i] = g.flow(eUnmet[i]); unmetSlots += unmet[i]; }

    const fixed = openIdx.reduce((a, j) => a + D[j].fixedCost * L.dcFixedIndex, 0);
    const hRate = L.holdingRate;
    let primary = 0, holding = 0, ordering = 0, ssValue = 0, cycleValue = 0, pipeValue = 0;
    let primTruckKm = 0;
    const dcOut = [], invRows = [], laneRows = [];
    for (let o = 0; o < nO; o++) {
      const j = openIdx[o];
      let pStar = 0; for (let p = 1; p < nP; p++) if (fPD[o][p] > fPD[o][pStar]) pStar = p;
      const transitDays = kmPD[pStar][j] / C.speedKmDay;
      const Lw = Math.max(1, Math.ceil((transitDays + L.handlingDays) / 7));
      const muK = [], sgK = [];
      for (let k = 0; k < K.length; k++) {
        let m = 0, v = 0;
        for (let i = 0; i < nC; i++) { if (gDC[o][i] <= 1e-9 || slots[i] <= 0) continue; const sh = gDC[o][i] / slots[i]; m += sh * mu[i][k]; v += sh * sh * sig[i][k] * sig[i][k]; }
        muK[k] = m; sgK[k] = Math.sqrt(v);
      }
      // choose review/shipping cycle R in {1..4} weeks: cycle holding vs trucking vs ordering
      let bestR = 1, bestCost = Infinity, bestFreight = 0;
      for (let R = 1; R <= 4; R++) {
        let cyc = 0; for (let k = 0; k < K.length; k++) cyc += K[k].value * hRate * muK[k] * R / 2;
        let fr = 0;
        for (let p = 0; p < nP; p++) { const f = fPD[o][p]; if (f <= 1e-6) continue; fr += (52 / R) * Math.ceil(f * R / C.truckCapacity - 1e-9) * C.ftlPerKm * L.freightIndex * kmPD[p][j]; }
        const ord = (52 / R) * C.orderCost * K.length;
        const tot = cyc + fr + ord;
        if (tot < bestCost - 1e-6) { bestCost = tot; bestR = R; bestFreight = fr; }
      }
      const R = bestR;
      primary += bestFreight;
      ordering += (52 / R) * C.orderCost * K.length;
      const Tprot = Lw + R;
      for (let p = 0; p < nP; p++) {
        const f = fPD[o][p]; if (f <= 1e-6) continue;
        const trucks = Math.ceil(f * R / C.truckCapacity - 1e-9);
        primTruckKm += (52 / R) * trucks * kmPD[p][j];
        if (detail) laneRows.push({ from: P[p].id, to: D[j].id, km: kmPD[p][j], slotsWk: f, everyWeeks: R, trucksPerShipment: trucks,
          util: f * R / (trucks * C.truckCapacity), costYr: (52 / R) * trucks * C.ftlPerKm * L.freightIndex * kmPD[p][j] });
      }
      let dcSS = 0, dcCyc = 0, dcPipe = 0;
      for (let k = 0; k < K.length; k++) {
        const ss = z * sgK[k] * Math.sqrt(Tprot), cyc = muK[k] * R / 2, pipe = muK[k] * transitDays / 7;
        const val = K[k].value;
        ssValue += ss * val; cycleValue += cyc * val; pipeValue += pipe * val;
        dcSS += ss * val; dcCyc += cyc * val; dcPipe += pipe * val;
        holding += (ss + cyc + pipe) * val * hRate;
        if (detail) invRows.push({ dc: D[j].id, sku: K[k].id, mu: muK[k], sigma: sgK[k], L: Lw, R, ss, cycle: cyc, pipeline: pipe, value: (ss + cyc + pipe) * val, holdingYr: (ss + cyc + pipe) * val * hRate });
      }
      dcOut.push({ id: D[j].id, idx: j, throughput: thr[o], util: D[j].capacity > 0 ? thr[o] / D[j].capacity : 0, primaryPlant: P[pStar].id, transitDays, L: Lw, R,
        muK, sgK, ssValue: dcSS, cycleValue: dcCyc, pipeValue: dcPipe, fixed: D[j].fixedCost * L.dcFixedIndex });
    }

    // returns / reverse logistics
    let revFreight = 0, revProcessing = 0, revRecovery = 0, revWriteoff = 0, revUnits = 0, revSlotKm = 0, revTruckKm = 0;
    const revByDC = [];
    for (let o = 0; o < nO; o++) {
      const j = openIdx[o]; let slotsBack = 0, unitsBack = 0;
      for (let i = 0; i < nC; i++) {
        const f = gDC[o][i]; if (f <= 1e-9 || slots[i] <= 0) continue; const sh = f / slots[i];
        for (let k = 0; k < K.length; k++) {
          const u = K[k].returnRate * L.returnIndex * mu[i][k] * sh * 52;
          if (u <= 0) continue;
          unitsBack += u; slotsBack += u * K[k].cube;
          revFreight += u * K[k].cube * (C.ltlPerSlotKm * kmDC[j][i] + C.dropPerSlot) * L.freightIndex * C.reversePremium;
          revSlotKm += u * K[k].cube * kmDC[j][i];
          revProcessing += u * K[k].processing;
          revRecovery += u * K[k].refurbShare * K[k].recovery * K[k].value;
          revWriteoff += u * K[k].value;
        }
      }
      const toHub = slotsBack * pp.ftlSlot * kmDH[j];
      revFreight += toHub; revTruckKm += slotsBack / (C.truckCapacity * C.targetFill) * kmDH[j];
      revUnits += unitsBack;
      revByDC.push({ id: D[j].id, units: unitsBack, slots: slotsBack, kmToHub: kmDH[j] });
    }
    const reverseNet = revFreight + revProcessing + revWriteoff - revRecovery;
    const unmetCost = unmetSlots * C.lostSalePenalty * 52;
    const total = fixed + plantCost + handling + primary + secondary + holding + ordering + reverseNet + unmetCost;

    const res = { open: openIdx.slice(), total, comp: { fixed, plant: plantCost, handling, primary, secondary, holding, ordering, reverse: reverseNet, unmet: unmetCost } };
    if (!detail) return res;

    // KPIs and detail
    let slotKmSec = 0, servedSlots = 0, oneDay = 0, wKm = 0;
    const assign = [], secLanes = [];
    for (let i = 0; i < nC; i++) {
      let bestO = -1, bestF = 0;
      for (let o = 0; o < nO; o++) { const f = gDC[o][i]; if (f > 1e-9) { const j = openIdx[o]; slotKmSec += f * kmDC[j][i] * 52; wKm += f * kmDC[j][i]; servedSlots += f; if (kmDC[j][i] <= C.speedKmDay) oneDay += f; secLanes.push({ from: D[j].id, to: Cu[i].id, slotsWk: f, km: kmDC[j][i], costYr: f * sec[j][i] * 52 }); if (f > bestF) { bestF = f; bestO = o; } } }
      assign[i] = bestO >= 0 ? D[openIdx[bestO]].id : null;
    }
    const totalSlots = slots.reduce((a, b) => a + b, 0);
    const secTruckKm = slotKmSec / (C.truckCapacity * C.targetFill) * C.ltlCo2Factor;
    const co2 = (primTruckKm + secTruckKm + revTruckKm + revSlotKm / (C.truckCapacity * C.targetFill) * C.ltlCo2Factor) * C.co2PerTruckKm / 1000;
    let decentral = 0, pooled = 0;
    for (let k = 0; k < K.length; k++) {
      for (let i = 0; i < nC; i++) decentral += z * sig[i][k] * Math.sqrt(2) * K[k].value;
    }
    for (const r of invRows) pooled += r.ss * K.find(p => p.id === r.sku).value;
    let annualUnits = 0, annualValue = 0;
    for (let i = 0; i < nC; i++) for (let k = 0; k < K.length; k++) { annualUnits += mu[i][k] * 52; annualValue += mu[i][k] * 52 * K[k].value; }
    res.dcs = dcOut; res.inv = invRows; res.primaryLanes = laneRows; res.secondaryLanes = secLanes; res.assign = assign;
    res.unmet = unmet;
    res.returns = { units: revUnits, freight: revFreight, processing: revProcessing, writeoff: revWriteoff, recovery: revRecovery, net: reverseNet, byDC: revByDC };
    res.kpi = {
      total, totalPerUnit: annualUnits ? total / annualUnits : 0, costToServePct: annualValue ? total / annualValue : 0,
      openDCs: nO, inventoryValue: ssValue + cycleValue + pipeValue, ssValue, cycleValue, pipeValue,
      avgKm: servedSlots ? wKm / servedSlots : 0, oneDayShare: servedSlots ? oneDay / servedSlots : 0,
      unservedShare: totalSlots ? unmetSlots / totalSlots : 0, trucksPerWeek: primTruckKm ? laneRows.reduce((a, r) => a + r.trucksPerShipment / r.everyWeeks, 0) : 0,
      primaryUtil: laneRows.length ? laneRows.reduce((a, r) => a + r.slotsWk, 0) / laneRows.reduce((a, r) => a + r.trucksPerShipment / r.everyWeeks * C.truckCapacity, 0) : 0,
      co2Tonnes: co2, annualUnits, annualValue, poolingSaving: Math.max(0, decentral - pooled), decentralSS: decentral
    };
    return res;
  };

  T.optimize = function (data, fc, levers, onProgress) {
    const pp = T.prepare(data, fc, levers);
    const D = data.dcs, locks = levers.locks || {};
    const forced = [], free = [];
    D.forEach((d, j) => { const s = locks[d.id] || 'auto'; if (s === 'open') forced.push(j); else if (s !== 'closed') free.push(j); });
    const F = free.length, total = 1 << F;
    const top = [];
    let best = null, evaluated = 0, pruned = 0;
    const push = (r) => {
      top.push(r); top.sort((a, b) => a.total - b.total); if (top.length > 6) top.pop();
    };
    for (let mask = 0; mask < total; mask++) {
      const open = forced.slice();
      for (let b = 0; b < F; b++) if (mask & (1 << b)) open.push(free[b]);
      if (!open.length) continue;
      open.sort((a, b) => a - b);
      const fixedLB = open.reduce((a, j) => a + D[j].fixedCost * levers.dcFixedIndex, 0);
      if (top.length >= 6 && fixedLB >= top[top.length - 1].total) { pruned++; continue; }
      const r = T.evaluate(pp, open, false); evaluated++;
      if (!best || r.total < best.total) best = r;
      push(r);
      if (onProgress && (mask & 63) === 0) onProgress(mask / total);
    }
    if (!best) return null;
    const full = T.evaluate(pp, best.open, true);
    full.alternatives = top.map(r => ({ open: r.open.map(j => D[j].id), total: r.total, comp: r.comp }));
    full.search = { configs: total, evaluated, pruned, freeDCs: F };
    full.levers = JSON.parse(JSON.stringify(levers));
    full.pp = pp;
    return full;
  };

  T.sweep = function (data, fc, levers, key, values) {
    return values.map(v => {
      const L = JSON.parse(JSON.stringify(levers)); L[key] = v;
      const r = T.optimize(data, fc, L);
      return { value: v, total: r.total, open: r.open.map(j => data.dcs[j].id), nOpen: r.open.length, comp: r.comp, kpi: r.kpi };
    });
  };

  /* ---------------- simulation (weekly, Monte Carlo) ---------------- */
  T.simulate = function (data, fc, levers, net, opts) {
    opts = opts || {};
    const reps = opts.reps || 30, warm = 8, weeks = 52;
    const pp = net.pp, K = data.products, P = data.plants, C = data.costs;
    const method = pp.method, g = pp.g, z = pp.z;
    const outage = levers.outage || {}; const downIdx = P.findIndex(p => p.id === outage.plantId);
    const oStart = outage.startWeek | 0, oEnd = oStart + (outage.weeks | 0);
    const rng = rngFrom((data.meta.seed ^ 0x9E3779B9) >>> 0), norm = normalFrom(rng);
    const dcs = net.dcs;
    // weekly mean demand per DC x SKU (seasonal), from customer forecasts and flow shares
    const mWeek = dcs.map((d, o) => K.map((p, k) => {
      const arr = new Float64Array(52);
      const oi = net.open.indexOf(d.idx);
      pp.Cu.forEach((c, i) => {
        const sl = pp.slots[i]; if (sl <= 0) return;
        const f = net.secondaryLanes.filter(l => l.from === d.id && l.to === c.id).reduce((a, l) => a + l.slotsWk, 0);
        if (f <= 1e-9) return; const sh = f / sl;
        const s = fc.series[c.id + '|' + p.id].fc[method];
        for (let h = 0; h < 52; h++) arr[h] += sh * s[h] * g;
      });
      return arr;
    }));
    const plantIdx = (id) => P.findIndex(p => p.id === id);
    const backup = dcs.map(d => {
      const j = d.idx, pr = plantIdx(d.primaryPlant);
      let b = -1, bc = Infinity;
      P.forEach((p, q) => { if (q === pr) return; if (pp.prim[q][j] < bc) { bc = pp.prim[q][j]; b = q; } });
      return b;
    });
    // spare capacity of each plant: what it can make in a week minus its average weekly flow in this design (lu/week)
    const spare = P.map(p => Math.max(0, p.capacity - net.primaryLanes.filter(l => l.from === p.id).reduce((a, l) => a + l.slotsWk, 0)));
    // one line per DC x SKU with demand, in DC then SKU order
    const items = [];
    dcs.forEach((d, o) => {
      const pr = plantIdx(d.primaryPlant), b = backup[o];
      const Lb = b >= 0 ? Math.max(1, Math.ceil((pp.kmPD[b][d.idx] / C.speedKmDay + levers.handlingDays) / 7)) : 0;
      const premium = b >= 0 ? Math.max(0, pp.prim[b][d.idx] - pp.prim[pr][d.idx]) : 0;
      K.forEach((p, k) => {
        const m = mWeek[o][k]; let mbar = 0; for (let h = 0; h < 52; h++) mbar += m[h]; mbar /= 52;
        if (mbar <= 1e-9) return;
        items.push({ o, k, p, m, mbar, sigma: d.sgK[k], Lw: d.L, R: d.R, pr, b, Lb, premium });
      });
    });
    const mAt = (it, t) => it.m[mod52(t)];
    const ssAt = (it, t) => z * it.sigma * Math.sqrt(it.Lw + it.R) * (levers.seasonalBuffers ? Math.max(0.35, mAt(it, t) / it.mbar) : 1);
    const S = (it, t) => { let a = 0; for (let tau = t; tau < t + it.Lw + it.R; tau++) a += mAt(it, tau); return a + ssAt(it, t); };
    const add = (pl, at, q) => pl.set(at, (pl.get(at) || 0) + q);
    const nW = weeks;
    const invVal = Array.from({ length: nW }, () => []), fillW = Array.from({ length: nW }, () => []);
    const dcStats = dcs.map(() => K.map(() => ({ served: 0, demand: 0, inv: 0, stockoutWeeks: 0 })));
    let expediteCost = 0, rerouted = 0;
    for (let rep = 0; rep < reps; rep++) {
      const wkInv = new Float64Array(nW), wkServed = new Float64Array(nW), wkDem = new Float64Array(nW);
      // draw this run's demand first, in DC, SKU, week order, so it never depends on the stock policy
      const dem = items.map(it => {
        const a = new Float64Array(warm + nW);
        for (let t = -warm; t < nW; t++) { const mean = mAt(it, t), sd = it.sigma * Math.max(0.35, mean / it.mbar); a[t + warm] = Math.max(0, mean + sd * norm()); }
        return a;
      });
      const onHand = items.map(it => S(it, -warm)), pipeline = items.map(() => new Map());
      const used = new Float64Array(P.length); // lu rerouted to each backup plant so far in this run
      for (let t = -warm; t < nW; t++) {
        const asks = [];
        items.forEach((it, x) => {
          const pl = pipeline[x];
          if (pl.has(t)) { onHand[x] += pl.get(t); pl.delete(t); }
          if (((t + warm) % it.R) !== 0) return;
          let onOrder = 0; for (const v of pl.values()) onOrder += v;
          const q = Math.max(0, S(it, t) - onHand[x] - onOrder);
          if (q <= 0) return;
          const plantDown = downIdx >= 0 && it.pr === downIdx && t >= oStart && t < oEnd;
          if (!plantDown) add(pl, t + it.Lw, q);
          else if (levers.reroute && it.b >= 0) asks.push({ x, q });
          else add(pl, oEnd + it.Lw, q);
        });
        if (asks.length) {
          // a backup plant ships at most the spare capacity built up since the outage began;
          // this week's rerouted orders share what is left in proportion to size, the rest waits for the restart
          const want = new Float64Array(P.length);
          for (const a of asks) want[items[a.x].b] += a.q * items[a.x].p.cube;
          const share = P.map((_, b) => want[b] > 0 ? Math.min(1, Math.max(0, spare[b] * (t - oStart + 1) - used[b]) / want[b]) : 0);
          for (const a of asks) {
            const it = items[a.x], qb = a.q * share[it.b], qw = a.q - qb;
            if (qb > 0) {
              add(pipeline[a.x], t + it.Lb, qb); used[it.b] += qb * it.p.cube;
              if (rep === 0) { rerouted += qb; expediteCost += qb * it.p.cube * it.premium; }
            }
            if (qw > 0) add(pipeline[a.x], oEnd + it.Lw, qw);
          }
        }
        items.forEach((it, x) => {
          const d = dem[x][t + warm], startOH = onHand[x], served = Math.min(startOH, d);
          onHand[x] = startOH - served;
          if (t >= 0) {
            const avgOH = (startOH + onHand[x]) / 2;
            wkInv[t] += avgOH * it.p.value; wkServed[t] += served * it.p.value; wkDem[t] += d * it.p.value;
            const st = dcStats[it.o][it.k]; st.served += served; st.demand += d; st.inv += avgOH; if (served < d - 1e-6) st.stockoutWeeks++;
          }
        });
      }
      for (let t = 0; t < nW; t++) { invVal[t].push(wkInv[t]); fillW[t].push(wkDem[t] > 0 ? wkServed[t] / wkDem[t] : 1); }
    }
    const band = (arrs) => arrs.map(a => { const s = a.slice().sort((x, y) => x - y); return { p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9) }; });
    const perDC = dcs.map((d, o) => ({ id: d.id, skus: K.map((p, k) => { const st = dcStats[o][k]; return { sku: p.id, fill: st.demand > 0 ? st.served / st.demand : 1, avgInv: st.inv / (reps * nW), stockoutWeeks: st.stockoutWeeks / reps }; }) }));
    let sv = 0, dm = 0; dcs.forEach((d, o) => K.forEach((p, k) => { const st = dcStats[o][k]; sv += st.served * p.value; dm += st.demand * p.value; }));
    return { inv: band(invVal), fill: band(fillW), perDC, fillRate: dm > 0 ? sv / dm : 1, avgInventory: band(invVal).reduce((a, b) => a + b.p50, 0) / nW,
      expediteCost, rerouted, reps, outage: downIdx >= 0 ? { plant: P[downIdx].id, start: oStart, end: oEnd } : null };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = T;
  else root.TRIB = T;
})(typeof window !== 'undefined' ? window : globalThis);
