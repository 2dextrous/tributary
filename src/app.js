(function () {
  'use strict';
  const T = window.TRIB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : String(kid));
    return e;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const nfIN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const n0 = (x) => isFinite(x) ? nfIN.format(Math.round(x)) : '—';
  const pct = (x, d = 1) => isFinite(x) ? (x * 100).toFixed(d) + '%' : '—';
  function inr(x, d = 1) {
    if (!isFinite(x)) return '—';
    const a = Math.abs(x), s = x < 0 ? '−' : '';
    if (a >= 1e7) return s + '₹' + (a / 1e7).toFixed(a >= 1e10 ? 0 : d) + ' cr';
    if (a >= 1e5) return s + '₹' + (a / 1e5).toFixed(d) + ' L';
    return s + '₹' + nfIN.format(Math.round(a));
  }
  const signedInr = (x) => Math.abs(x) < 5e3 ? '±₹0' : (x > 0 ? '+' : '−') + inr(Math.abs(x)).replace('−', '');
  const idxFmt = (v) => { const p = Math.round((v - 1) * 100); return p === 0 ? 'Today' : (p > 0 ? '+' : '−') + Math.abs(p) + '%'; };

  /* ---------------- lever schema ---------------- */
  const LEVERS = [
    { key: 'holdingRate', group: 'Costs', label: 'Holding cost', hint: 'Cost of carrying stock, as % of product value per year', min: 0.05, max: 0.8, step: 0.01, fmt: v => Math.round(v * 100) + '%', disp: 100, unit: '%' },
    { key: 'freightIndex', group: 'Costs', label: 'Freight rates', hint: 'Diesel and carrier rates compared with today', min: 0.5, max: 2, step: 0.05, fmt: idxFmt, disp: 100, unit: '% of today' },
    { key: 'dcFixedIndex', group: 'Costs', label: 'DC rent and staff', hint: 'Fixed cost of running each DC compared with today', min: 0.4, max: 2.5, step: 0.05, fmt: idxFmt, disp: 100, unit: '% of today' },
    { key: 'demandGrowth', group: 'Market', label: 'Demand vs forecast', hint: 'Shift every forecast up or down', min: -0.4, max: 0.8, step: 0.05, fmt: v => (v >= 0 ? '+' : '−') + Math.round(Math.abs(v) * 100) + '%', disp: 100, unit: '%' },
    { key: 'returnIndex', group: 'Market', label: 'Return rate', hint: "Multiplier on each product's return rate", min: 0.25, max: 3, step: 0.05, fmt: v => '×' + v.toFixed(2), disp: 1, unit: '×' },
    { key: 'serviceLevel', group: 'Service', label: 'Service level target', hint: 'Chance a DC does not run out before its next delivery', min: 0.8, max: 0.995, step: 0.005, fmt: v => (v * 100).toFixed(1) + '%', disp: 100, unit: '%' },
    { key: 'maxServiceKm', group: 'Service', label: 'Max delivery distance', hint: 'Furthest a DC may ship to a customer, by road', min: 400, max: 2500, step: 50, fmt: v => n0(v) + ' km', disp: 1, unit: 'km' },
    { key: 'handlingDays', group: 'Service', label: 'Handling time', hint: 'Plant dispatch plus DC receiving, in days', min: 1, max: 10, step: 1, fmt: v => v + (v === 1 ? ' day' : ' days'), disp: 1, unit: 'days' }
  ];
  const LEVER = Object.fromEntries(LEVERS.map(l => [l.key, l]));
  const COMP = [
    ['secondary', 'Last-mile delivery', 'var(--flow)'], ['fixed', 'DC rent and staff', 'var(--ink)'], ['reverse', 'Returns', 'var(--amber)'],
    ['holding', 'Holding inventory', 'var(--plant)'], ['primary', 'Line-haul trucking', 'var(--ink-2)'], ['plant', 'Plant dispatch', 'var(--ink-3)'],
    ['handling', 'DC handling', 'var(--line)'], ['ordering', 'Ordering', 'var(--bg-sunk)'], ['unmet', 'Lost sales', 'var(--bad)']
  ];

  /* ---------------- state ---------------- */
  const STORE = 'tributary.model.v1';
  const App = {
    data: null, fc: null, dataVersion: 1, baseline: null, draft: null, pinned: [], audit: [],
    tab: 'forecast', dataSub: 'plants', dirty: false, showReturns: false, simReps: 30,
    fcSel: { sku: null, loc: 'ALL' }, sweepCfg: { key: 'freightIndex', from: 0.7, to: 1.6, steps: 10 }, sweep: null, sweepStop: false,
    compareSel: null, sample: null, downloads: null, cpAbort: null, fvCache: null
  };
  const sameLevers = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        data: App.data, baselineLevers: App.baseline.levers,
        draft: { name: App.draft.name, levers: App.draft.levers, origin: App.draft.origin },
        pinned: App.pinned.map(p => ({ id: p.id, name: p.name, levers: p.levers, origin: p.origin })), audit: App.audit.slice(-60)
      }));
    } catch (e) { /* storage unavailable: keep working in memory */ }
  }
  function loadSaved() {
    try { const raw = localStorage.getItem(STORE); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function normaliseLevers(L) {
    const d = T.defaultLevers(); const out = Object.assign(d, L || {});
    out.locks = Object.assign({}, (L && L.locks) || {}); out.outage = Object.assign(T.defaultLevers().outage, (L && L.outage) || {});
    return out;
  }

  function runScenario(levers) {
    const res = T.optimize(App.data, App.fc, levers);
    const sim = T.simulate(App.data, App.fc, levers, res, { reps: App.simReps });
    return { res, sim };
  }

  /* ---------------- status / toast ---------------- */
  function setStatus(msg, busy) { const s = $('#status'); s.textContent = msg; s.classList.toggle('busy', !!busy); }
  let toastTimer = null;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }
  function logAudit(actor, action) {
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    App.audit.push({ time, actor, action }); renderAudit(); save();
  }

  /* ---------------- theme colours ---------------- */
  let COL = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['bg', 'bg-elev', 'bg-sunk', 'map-bg', 'ink', 'ink-2', 'ink-3', 'line', 'line-soft', 'flow', 'flow-soft', 'plant', 'amber', 'good', 'bad', 'grid'])
      COL[k] = cs.getPropertyValue('--' + k).trim();
  }
  function alpha(hex, a) {
    if (!hex) return `rgba(0,0,0,${a})`;
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
    let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const UIFONT = getComputedStyle(document.documentElement).getPropertyValue('--font-ui') || 'sans-serif';

  /* ================= MAP ================= */
  const MapView = (() => {
    const cv = $('#map'), wrap = $('#mapwrap'), tip = $('#tip'), ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1, P = null, res = null, lv = null, nodes = [], lanes = [], retLanes = [], parts = [], ripples = [];
    let hover = null, reveal = performance.now(), last = performance.now(), visible = true, raf = 0, labels = [];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');

    function buildProj() {
      const D = App.data; if (!D) return; const pts = [...D.plants, ...D.dcs, ...D.customers, D.returnsHub];
      let a0 = 90, a1 = -90, o0 = 180, o1 = -180;
      for (const p of pts) { a0 = Math.min(a0, p.lat); a1 = Math.max(a1, p.lat); o0 = Math.min(o0, p.lon); o1 = Math.max(o1, p.lon); }
      const pa = Math.max(0.7, (a1 - a0) * 0.07), po = Math.max(0.7, (o1 - o0) * 0.07);
      a0 -= pa; a1 += pa; o0 -= po; o1 += po;
      const cx = Math.cos((a0 + a1) / 2 * Math.PI / 180), fr = 16, inner = fr + 8;
      const aw = W - 2 * inner - 24, ah = H - 2 * inner - 24;
      const s = Math.max(1e-3, Math.min(aw / ((o1 - o0) * cx), ah / (a1 - a0)));
      const ox = inner + 12 + (aw - (o1 - o0) * cx * s) / 2, oy = inner + 12 + (ah - (a1 - a0) * s) / 2;
      P = { a0, a1, o0, o1, cx, s, ox, oy, fr, x: (lon) => ox + (lon - o0) * cx * s, y: (lat) => oy + (a1 - lat) * s,
        lon: (x) => o0 + (x - ox) / (cx * s), lat: (y) => a1 - (y - oy) / s, kmPx: s / 111.2 };
    }
    function qpt(c, t) { const u = 1 - t; return [u * u * c.ax + 2 * u * t * c.cx + t * t * c.bx, u * u * c.ay + 2 * u * t * c.cy + t * t * c.by]; }
    function curve(a, b, bend) {
      const ax = P.x(a.lon), ay = P.y(a.lat), bx = P.x(b.lon), by = P.y(b.lat);
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
      return { ax, ay, bx, by, cx: (ax + bx) / 2 - dy * bend, cy: (ay + by) / 2 + dx * bend, len: len * (1 + bend * bend * 2.6) };
    }
    function build() {
      if (!P) return;
      const D = App.data; nodes = []; lanes = []; retLanes = [];
      const byId = {};
      const maxW = Math.max(...D.customers.map(c => c.weight), 1);
      const unmet = res ? res.unmet : [];
      const openSet = new Set(res ? res.open : []);
      D.customers.forEach((c, i) => { const n = { kind: 'cust', ref: c, i, x: P.x(c.lon), y: P.y(c.lat), r: 2.4 + 6.2 * Math.sqrt(c.weight / maxW), short: unmet[i] > 1e-6 }; nodes.push(n); byId[c.id] = n; });
      D.dcs.forEach((d, j) => { const n = { kind: 'dc', ref: d, j, x: P.x(d.lon), y: P.y(d.lat), open: openSet.has(j), lock: (lv && lv.locks[d.id]) || 'auto' }; nodes.push(n); byId[d.id] = n; });
      D.plants.forEach((p, q) => { const n = { kind: 'plant', ref: p, q, x: P.x(p.lon), y: P.y(p.lat), down: lv && lv.outage && lv.outage.plantId === p.id }; nodes.push(n); byId[p.id] = n; });
      nodes.push({ kind: 'hub', ref: D.returnsHub, x: P.x(D.returnsHub.lon), y: P.y(D.returnsHub.lat) });
      placeLabels();
      if (!res) return;
      const find = (id, arr) => arr.find(x => x.id === id);
      const maxP = Math.max(...res.primaryLanes.map(l => l.slotsWk), 1), maxS = Math.max(...res.secondaryLanes.map(l => l.slotsWk), 1);
      for (const l of res.primaryLanes) {
        const a = find(l.from, D.plants), b = find(l.to, D.dcs); if (!a || !b) continue;
        lanes.push({ type: 'p', c: curve(a, b, 0.1), w: 1.6 + 4.2 * Math.sqrt(l.slotsWk / maxP), v: l.slotsWk / maxP, from: l.from, to: l.to });
      }
      for (const l of res.secondaryLanes) {
        const a = find(l.from, D.dcs), b = find(l.to, D.customers); if (!a || !b) continue;
        lanes.push({ type: 's', c: curve(a, b, 0.16), w: 0.6 + 2.4 * Math.sqrt(l.slotsWk / maxS), v: l.slotsWk / maxS, from: l.from, to: l.to });
      }
      const maxR = Math.max(...res.returns.byDC.map(r => r.slots), 1);
      for (const r of res.returns.byDC) { const a = find(r.id, D.dcs); if (!a) continue; retLanes.push({ c: curve(a, D.returnsHub, -0.18), w: 1 + 3 * Math.sqrt(r.slots / maxR) }); }
      parts = [];
      for (const ln of lanes) {
        const count = ln.type === 'p' ? Math.round(3 + 9 * ln.v) : Math.max(1, Math.round(1 + 5 * ln.v));
        for (let k = 0; k < count; k++) parts.push({ ln, t: (k + Math.random() * 0.5) / count });
      }
    }
    function placeLabels() {
      labels = []; const placed = [];
      const marks = nodes.filter(n => n.kind !== 'cust').map(n => ({ x: n.x - 9, y: n.y - 9, w: 18, h: 18, n }));
      const order = [...nodes.filter(n => n.kind === 'plant'), ...nodes.filter(n => n.kind === 'dc' && n.open), ...nodes.filter(n => n.kind === 'dc' && !n.open)];
      const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      for (const n of order) {
        const strong = n.kind === 'plant' || n.open; const size = strong ? 12.5 : 11; const weight = strong ? 700 : 500;
        ctx.font = `${weight} ${size}px ${UIFONT}`; const text = n.ref.name; const w = ctx.measureText(text).width + 2, h = size + 4, off = 13;
        const opts = [{ x: n.x + off, y: n.y - h / 2 }, { x: n.x - off - w, y: n.y - h / 2 }, { x: n.x - w / 2, y: n.y - off - h }, { x: n.x - w / 2, y: n.y + off }, { x: n.x + off, y: n.y - h - 4 }, { x: n.x + off, y: n.y + 4 }];
        let best = null, bs = Infinity;
        opts.forEach((o, k) => {
          const box = { x: o.x, y: o.y, w, h }; let sc = k * 0.5;
          for (const pb of placed) sc += inter(box, pb) * 4;
          for (const m of marks) if (m.n !== n) sc += inter(box, m) * 2;
          if (box.x < P.fr + 8 || box.x + w > W - P.fr - 8 || box.y < P.fr + 8 || box.y + h > H - P.fr - 8) sc += 5000;
          if (sc < bs) { bs = sc; best = box; }
        });
        placed.push(best);
        labels.push({ n, text, x: best.x, y: best.y + h / 2, size, weight });
      }
    }
    function resize() {
      if (!App.data) return;
      const r = wrap.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(240, r.width); H = Math.max(240, r.height); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      buildProj(); build(); draw(performance.now());
    }
    function setResult(r, levers, prevOpen) {
      res = r; lv = levers; build();
      if (prevOpen && !reduce.matches) {
        const now = performance.now(); const openNow = new Set(r.open); let changed = 0;
        nodes.filter(n => n.kind === 'dc').forEach(n => {
          if (openNow.has(n.j) !== prevOpen.has(n.j)) { ripples.push({ x: n.x, y: n.y, t0: now, strong: true }); changed++; }
        });
        if (!changed) nodes.filter(n => n.kind === 'dc' && n.open).forEach((n, k) => ripples.push({ x: n.x, y: n.y, t0: now + k * 90, strong: false }));
      }
      kick();
    }
    function replayReveal() { reveal = performance.now(); kick(); }
    function partial(c, p) {
      // de Casteljau split at p
      const x01 = c.ax + (c.cx - c.ax) * p, y01 = c.ay + (c.cy - c.ay) * p, x12 = c.cx + (c.bx - c.cx) * p, y12 = c.cy + (c.by - c.cy) * p;
      return { cx: x01, cy: y01, bx: x01 + (x12 - x01) * p, by: y01 + (y12 - y01) * p };
    }
    function diamond(x, y, s) { ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); }
    function label(text, x, y, color, weight, size, align) {
      ctx.font = `${weight} ${size}px ${UIFONT}`; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = alpha(COL['map-bg'], 0.92); ctx.strokeText(text, x, y);
      ctx.fillStyle = color; ctx.fillText(text, x, y);
    }
    function drawFrame() {
      const fr = P.fr, x0 = fr, y0 = fr, x1 = W - fr, y1 = H - fr, band = 6;
      ctx.lineWidth = 1; ctx.strokeStyle = COL.grid;
      for (let lon = Math.ceil(P.lon(x0) / 2) * 2; lon <= P.lon(x1); lon += 2) { const x = Math.round(P.x(lon)) + 0.5; ctx.beginPath(); ctx.moveTo(x, y0 + band); ctx.lineTo(x, y1 - band); ctx.stroke(); }
      for (let lat = Math.ceil(P.lat(y1) / 2) * 2; lat <= P.lat(y0); lat += 2) { const y = Math.round(P.y(lat)) + 0.5; ctx.beginPath(); ctx.moveTo(x0 + band, y); ctx.lineTo(x1 - band, y); ctx.stroke(); }
      // graduated border, alternating per degree
      const segsX = [], segsY = [];
      for (let lon = Math.floor(P.lon(x0)); lon <= P.lon(x1); lon++) segsX.push(lon);
      for (let lat = Math.floor(P.lat(y1)); lat <= P.lat(y0); lat++) segsY.push(lat);
      for (const lon of segsX) {
        const a = clamp(P.x(lon), x0, x1), b = clamp(P.x(lon + 1), x0, x1); if (b <= a) continue;
        ctx.fillStyle = (lon & 1) ? COL.ink : COL['bg-elev'];
        ctx.fillRect(a, y0, b - a, band); ctx.fillRect(a, y1 - band, b - a, band);
      }
      for (const lat of segsY) {
        const a = clamp(P.y(lat + 1), y0, y1), b = clamp(P.y(lat), y0, y1); if (b <= a) continue;
        ctx.fillStyle = (lat & 1) ? COL.ink : COL['bg-elev'];
        ctx.fillRect(x0, a, band, b - a); ctx.fillRect(x1 - band, a, band, b - a);
      }
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
      ctx.strokeRect(x0 + band + 0.5, y0 + band + 0.5, x1 - x0 - 2 * band - 1, y1 - y0 - 2 * band - 1);
      ctx.font = `500 10.5px ${UIFONT}`; ctx.fillStyle = COL['ink-3']; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
      for (let lon = Math.ceil(P.lon(x0 + 30) / 4) * 4; lon <= P.lon(x1 - 30); lon += 4) ctx.fillText(lon + '°E', P.x(lon), y0 + band + 4);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (let lat = Math.ceil(P.lat(y1 - 20) / 4) * 4; lat <= P.lat(y0 + 30); lat += 4) ctx.fillText(lat + '°N', x0 + band + 5, P.y(lat));
    }
    function draw(now) {
      if (!P) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COL['map-bg']; ctx.fillRect(0, 0, W, H);
      drawFrame();
      const rv = reduce.matches ? 1 : clamp((now - reveal) / 1500, 0, 1);
      const ease = 1 - Math.pow(1 - rv, 3);
      if (res) {
        // one-day delivery rings
        const rpx = (App.data.costs.speedKmDay / App.data.costs.roadFactor) * P.kmPx;
        ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = alpha(COL.flow, 0.38);
        for (const n of nodes) if (n.kind === 'dc' && n.open) { ctx.beginPath(); ctx.arc(n.x, n.y, rpx * ease, 0, Math.PI * 2); ctx.stroke(); }
        ctx.setLineDash([]);
        if (App.showReturns) {
          ctx.setLineDash([5, 4]); ctx.strokeStyle = alpha(COL.amber, 0.85);
          for (const r of retLanes) { ctx.lineWidth = r.w; const pc = partial(r.c, ease); ctx.beginPath(); ctx.moveTo(r.c.ax, r.c.ay); ctx.quadraticCurveTo(pc.cx, pc.cy, pc.bx, pc.by); ctx.stroke(); }
          ctx.setLineDash([]);
        }
        for (const ln of lanes) {
          const hl = hover && (hover.ref.id === ln.from || hover.ref.id === ln.to);
          const a = ln.type === 'p' ? 0.7 : 0.3;
          ctx.strokeStyle = alpha(COL.flow, hover ? (hl ? 0.95 : a * 0.35) : a); ctx.lineWidth = ln.w;
          const pc = partial(ln.c, ease); ctx.beginPath(); ctx.moveTo(ln.c.ax, ln.c.ay); ctx.quadraticCurveTo(pc.cx, pc.cy, pc.bx, pc.by); ctx.stroke();
        }
        if (!reduce.matches && rv >= 1) {
          const dt = Math.min(0.05, (now - last) / 1000);
          ctx.fillStyle = COL.flow;
          for (const pt of parts) {
            const speed = pt.ln.type === 'p' ? 70 : 46;
            pt.t += speed * dt / Math.max(40, pt.ln.c.len); if (pt.t > 1) pt.t -= 1;
            const [x, y] = qpt(pt.ln.c, pt.t);
            ctx.globalAlpha = Math.sin(pt.t * Math.PI) * (pt.ln.type === 'p' ? 1 : 0.85);
            ctx.beginPath(); ctx.arc(x, y, pt.ln.type === 'p' ? 2.4 : 1.6, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
      // nodes
      for (const n of nodes) {
        const isH = hover === n;
        if (n.kind === 'cust') {
          ctx.fillStyle = alpha(COL.ink, isH ? 1 : 0.78); ctx.beginPath(); ctx.arc(n.x, n.y, n.r + (isH ? 1.5 : 0), 0, Math.PI * 2); ctx.fill();
          if (n.short) { ctx.strokeStyle = COL.bad; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3.5, 0, Math.PI * 2); ctx.stroke(); }
        } else if (n.kind === 'hub') {
          const s = 7; ctx.beginPath(); ctx.moveTo(n.x, n.y - s); ctx.lineTo(n.x + s, n.y + s * 0.8); ctx.lineTo(n.x - s, n.y + s * 0.8); ctx.closePath();
          ctx.fillStyle = App.showReturns ? COL.amber : alpha(COL.amber, 0.35); ctx.fill();
        }
      }
      for (const n of nodes) {
        if (n.kind !== 'dc') continue;
        const s = (n.open ? 9 : 7) + (hover === n ? 2 : 0);
        diamond(n.x, n.y, s);
        if (n.open) { ctx.fillStyle = COL.flow; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = COL['bg-elev']; ctx.stroke(); }
        else { ctx.fillStyle = COL['map-bg']; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = COL['ink-3']; ctx.stroke(); }
        if (n.lock === 'open') { diamond(n.x, n.y, s + 5); ctx.lineWidth = 1.2; ctx.strokeStyle = COL.ink; ctx.stroke(); }
        if (n.lock === 'closed') { ctx.beginPath(); ctx.moveTo(n.x - s - 3, n.y + s + 3); ctx.lineTo(n.x + s + 3, n.y - s - 3); ctx.lineWidth = 2; ctx.strokeStyle = COL.bad; ctx.stroke(); }
      }
      for (const n of nodes) {
        if (n.kind !== 'plant') continue;
        const s = 7 + (hover === n ? 1.5 : 0);
        ctx.fillStyle = COL.plant; ctx.fillRect(n.x - s, n.y - s, 2 * s, 2 * s); ctx.lineWidth = 2; ctx.strokeStyle = COL['bg-elev']; ctx.strokeRect(n.x - s, n.y - s, 2 * s, 2 * s);
        if (n.down) { ctx.strokeStyle = COL.amber; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(n.x - s - 4, n.y - s - 4); ctx.lineTo(n.x + s + 4, n.y + s + 4); ctx.moveTo(n.x + s + 4, n.y - s - 4); ctx.lineTo(n.x - s - 4, n.y + s + 4); ctx.stroke(); }
      }
      // ripples
      ripples = ripples.filter(r => now - r.t0 < 1500);
      for (const r of ripples) {
        const p = (now - r.t0) / 1500; if (p < 0) continue;
        for (let k = 0; k < (r.strong ? 3 : 1); k++) {
          const q = p - k * 0.16; if (q <= 0) continue;
          ctx.strokeStyle = alpha(COL.flow, (1 - q) * (r.strong ? 0.9 : 0.45)); ctx.lineWidth = r.strong ? 2 : 1.2;
          ctx.beginPath(); ctx.arc(r.x, r.y, 10 + q * (r.strong ? 70 : 40), 0, Math.PI * 2); ctx.stroke();
        }
      }
      // labels
      for (const lb of labels) label(lb.text, lb.x, lb.y, lb.n.kind === 'plant' ? COL.plant : (lb.n.open ? COL.ink : COL['ink-3']), lb.weight, lb.size);
      const hubN = nodes.find(n => n.kind === 'hub'); if (hubN && App.showReturns) label('Returns hub', hubN.x - 10, hubN.y + 16, COL.amber, 700, 11.5);
      if (hover && hover.kind === 'cust') label(hover.ref.name, hover.x + hover.r + 5, hover.y, COL.ink, 600, 12);
      last = now;
    }
    function loop(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      draw(now);
      const animating = !reduce.matches && (res || ripples.length);
      if (animating) raf = requestAnimationFrame(loop);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(loop); if (reduce.matches) draw(performance.now()); }
    function hit(mx, my) {
      let best = null, bd = 16;
      for (const n of nodes) { const d = Math.hypot(n.x - mx, n.y - my) - (n.r || 6) * 0.5; if (d < bd) { bd = d; best = n; } }
      return best;
    }
    function tipHtml(n) {
      const r = res; const D = App.data;
      if (n.kind === 'cust') {
        const i = n.i; const lanesTo = r ? r.secondaryLanes.filter(l => l.to === n.ref.id) : [];
        const pp = r && r.pp;
        let rows = '';
        if (pp) D.products.forEach((p, k) => { rows += `<div class="row"><span>${esc(p.name)}</span><span>${n0(pp.mu[i][k])}/wk</span></div>`; });
        const src = lanesTo.map(l => `${esc(D.dcs.find(d => d.id === l.from).name)} (${n0(l.km)} km)`).join(', ');
        return `<b>${esc(n.ref.name)}</b>${rows}<div class="row"><span>Served from</span><span>${src || 'Unserved'}</span></div>${n.short ? '<div class="hint">Some demand here goes unserved</div>' : ''}`;
      }
      if (n.kind === 'dc') {
        const d = n.ref; const info = r && r.dcs.find(x => x.id === d.id);
        const lock = (lv && lv.locks[d.id]) || 'auto';
        const lockTxt = { auto: 'Optimizer decides', open: 'Locked open', closed: 'Locked closed' }[lock];
        const next = { auto: 'lock it open', open: 'lock it closed', closed: 'let the optimizer decide' }[lock];
        if (!info) return `<b>${esc(d.name)} DC</b><div class="row"><span>Status</span><span>Not used</span></div><div class="row"><span>Control</span><span>${lockTxt}</span></div><div class="row"><span>Fixed cost</span><span>${inr(d.fixedCost * lv.dcFixedIndex)}/yr</span></div><div class="hint">Click to ${next}</div>`;
        const served = r.assign.filter(a => a === d.id).length;
        return `<b>${esc(d.name)} DC</b><div class="row"><span>Status</span><span>In use</span></div><div class="row"><span>Control</span><span>${lockTxt}</span></div>` +
          `<div class="row"><span>Throughput</span><span>${n0(info.throughput)} / ${n0(d.capacity)} lu/wk</span></div><div class="row"><span>Utilisation</span><span>${pct(info.util, 0)}</span></div>` +
          `<div class="row"><span>Demand points</span><span>${served}</span></div><div class="row"><span>Restocked</span><span>every ${info.R} wk, ${info.L} wk lead</span></div>` +
          `<div class="row"><span>Inventory</span><span>${inr(info.ssValue + info.cycleValue)}</span></div><div class="hint">Click to ${next}</div>`;
      }
      if (n.kind === 'plant') {
        const p = n.ref; const out = r ? r.primaryLanes.filter(l => l.from === p.id).reduce((a, l) => a + l.slotsWk, 0) : 0;
        return `<b>${esc(p.name)} plant</b><div class="row"><span>Ships</span><span>${n0(out)} lu/wk</span></div><div class="row"><span>Capacity</span><span>${n0(p.capacity)} lu/wk</span></div><div class="row"><span>Utilisation</span><span>${pct(p.capacity ? out / p.capacity : 0, 0)}</span></div>${n.down ? '<div class="hint">Outage set in Simulate</div>' : ''}`;
      }
      return `<b>${esc(App.data.returnsHub.name)}</b><div class="row"><span>Returns in</span><span>${n0(r ? r.returns.units : 0)} units/yr</span></div>`;
    }
    cv.addEventListener('pointermove', (e) => {
      const b = cv.getBoundingClientRect(); const mx = e.clientX - b.left, my = e.clientY - b.top;
      const n = hit(mx, my);
      if (n !== hover) { hover = n; cv.style.cursor = n && n.kind === 'dc' ? 'pointer' : 'default'; kick(); }
      if (n) {
        tip.innerHTML = tipHtml(n); tip.hidden = false;
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        let x = mx + 16, y = my + 12; if (x + tw > W - 8) x = mx - tw - 16; if (y + th > H - 8) y = H - th - 8;
        tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
      } else tip.hidden = true;
    });
    cv.addEventListener('pointerleave', () => { hover = null; tip.hidden = true; kick(); });
    cv.addEventListener('click', (e) => {
      const b = cv.getBoundingClientRect(); const n = hit(e.clientX - b.left, e.clientY - b.top);
      if (n && n.kind === 'dc') cycleLock(n.ref.id);
    });
    new ResizeObserver(() => resize()).observe(wrap);
    new IntersectionObserver((ents) => { visible = ents.some(x => x.isIntersecting); if (visible) kick(); }).observe(wrap);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    return { resize, setResult, replayReveal, kick, rebuild: () => { buildProj(); build(); kick(); } };
  })();

  function cycleLock(id) {
    const L = App.draft.levers; const cur = L.locks[id] || 'auto';
    const nxt = { auto: 'open', open: 'closed', closed: 'auto' }[cur];
    if (nxt === 'auto') delete L.locks[id]; else L.locks[id] = nxt;
    markDraftEdited();
    const d = App.data.dcs.find(x => x.id === id);
    toast(`${d.name} DC: ${{ auto: 'optimizer decides', open: 'locked open', closed: 'locked closed' }[nxt]}`);
    scheduleRecompute(60);
  }

  /* ================= CHARTS ================= */
  function setupCanvas(cv, height) {
    const w = Math.max(260, cv.parentElement.getBoundingClientRect().width);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.height = height + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(height * dpr);
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, w, h: height };
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo || Math.abs(hi) || 1; const raw = span / n; const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const e = raw / mag; const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step; const out = [];
    for (let v = a; v <= b + step * 1e-6; v += step) out.push(+v.toFixed(10));
    return out;
  }
  const col = (c) => (c && c.startsWith('--')) ? COL[c.slice(2)] : c;
  function lineChart(cv, cfg) {
    const { ctx, w, h } = setupCanvas(cv, cfg.height || 260);
    const pad = { l: cfg.padL || 62, r: 16, t: 14, b: 30 };
    let lo = Infinity, hi = -Infinity;
    for (const s of cfg.series) {
      for (const v of s.y) if (v != null && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (s.band) { for (const v of s.band.lo) if (isFinite(v)) lo = Math.min(lo, v); for (const v of s.band.hi) if (isFinite(v)) hi = Math.max(hi, v); }
    }
    if (cfg.yMin != null) lo = Math.min(lo, cfg.yMin); if (cfg.yMax != null) hi = Math.max(hi, cfg.yMax);
    if (cfg.yFloor != null) lo = cfg.yFloor;
    if (!isFinite(lo)) { lo = 0; hi = 1; } if (hi - lo < 1e-9) hi = lo + 1;
    const ticks = niceTicks(lo, hi, cfg.ticks || 4); lo = ticks[0]; hi = ticks[ticks.length - 1];
    const n = cfg.n, X = (i) => pad.l + (w - pad.l - pad.r) * (n <= 1 ? 0.5 : i / (n - 1)), Y = (v) => pad.t + (h - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
    for (const sh of cfg.shade || []) {
      ctx.fillStyle = col(sh.color) || alpha(COL.amber, 0.14); ctx.fillRect(X(sh.from), pad.t, Math.max(2, X(sh.to) - X(sh.from)), h - pad.t - pad.b);
      if (sh.label) { ctx.fillStyle = COL['ink-2']; ctx.font = `600 11px ${UIFONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(sh.label, X(sh.from) + 4, pad.t + 3); }
    }
    ctx.font = `500 11.5px ${UIFONT}`; ctx.lineWidth = 1;
    for (const t of ticks) {
      const y = Math.round(Y(t)) + 0.5; ctx.strokeStyle = COL.grid; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = COL['ink-3']; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(cfg.yFmt(t), pad.l - 8, y);
    }
    ctx.strokeStyle = COL.ink; ctx.beginPath(); ctx.moveTo(pad.l, h - pad.b + 0.5); ctx.lineTo(w - pad.r, h - pad.b + 0.5); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = COL['ink-3'];
    for (const xt of cfg.xTicks || []) { const x = X(xt.i); ctx.fillText(xt.label, clamp(x, pad.l + 20, w - pad.r - 24), h - pad.b + 8); ctx.beginPath(); ctx.moveTo(x + 0.5, h - pad.b); ctx.lineTo(x + 0.5, h - pad.b + 4); ctx.strokeStyle = COL.ink; ctx.stroke(); }
    for (const vl of cfg.vlines || []) {
      const x = Math.round(X(vl.i)) + 0.5; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = col(vl.color) || COL['ink-2']; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      if (vl.label) { ctx.font = `600 11px ${UIFONT}`; ctx.fillStyle = col(vl.color) || COL['ink-2']; ctx.textAlign = vl.align || 'left'; ctx.textBaseline = 'top'; ctx.fillText(vl.label, x + (vl.align === 'right' ? -5 : 5), pad.t + 2); }
    }
    for (const s of cfg.series) {
      if (!s.band) continue; ctx.beginPath(); let started = false;
      for (let i = 0; i < n; i++) { const v = s.band.hi[i]; if (v == null || !isFinite(v)) continue; if (!started) { ctx.moveTo(X(i), Y(v)); started = true; } else ctx.lineTo(X(i), Y(v)); }
      for (let i = n - 1; i >= 0; i--) { const v = s.band.lo[i]; if (v == null || !isFinite(v)) continue; ctx.lineTo(X(i), Y(v)); }
      ctx.closePath(); ctx.fillStyle = alpha(col(s.color), s.bandAlpha || 0.16); ctx.fill();
    }
    for (const s of cfg.series) {
      ctx.beginPath(); let pen = false;
      for (let i = 0; i < n; i++) { const v = s.y[i]; if (v == null || !isFinite(v)) { pen = false; continue; } const x = X(i), y = Y(v); if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y); }
      ctx.strokeStyle = col(s.color); ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash || []); ctx.lineJoin = 'round'; ctx.stroke(); ctx.setLineDash([]);
      if (s.points) for (let i = 0; i < n; i++) { const v = s.y[i]; if (v == null) continue; ctx.beginPath(); ctx.arc(X(i), Y(v), (s.pointR && s.pointR[i]) || 3.5, 0, Math.PI * 2); ctx.fillStyle = (s.pointColor && col(s.pointColor[i])) || col(s.color); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = COL['bg-elev']; ctx.stroke(); }
    }
    for (const lb of cfg.labels || []) {
      ctx.font = `600 11.5px ${UIFONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = col(lb.color) || COL.ink;
      ctx.fillText(lb.text, clamp(X(lb.i), pad.l + 20, w - pad.r - 20), Y(lb.v) - 8);
    }
  }
  function waterfall(cv, items, height) {
    const { ctx, w, h } = setupCanvas(cv, height || 290);
    const pad = { l: 62, r: 12, t: 22, b: 46 };
    let run = 0, lo = Infinity, hi = -Infinity; const bars = [];
    for (const it of items) {
      if (it.kind === 'total') { bars.push({ ...it, a: 0, b: it.value }); run = it.value; }
      else { const a = run, b = run + it.value; bars.push({ ...it, a, b }); run = b; }
    }
    for (const b of bars) { lo = Math.min(lo, b.a, b.b); hi = Math.max(hi, b.a, b.b); }
    const totals = bars.filter(b => b.kind === 'total').map(b => b.value);
    const deltasMax = Math.max(...bars.filter(b => b.kind !== 'total').map(b => Math.max(b.a, b.b)), ...totals);
    const deltasMin = Math.min(...bars.filter(b => b.kind !== 'total').map(b => Math.min(b.a, b.b)), ...totals);
    lo = Math.max(0, deltasMin - (deltasMax - deltasMin) * 0.6 - 1); hi = deltasMax + (deltasMax - deltasMin) * 0.15 + 1;
    const ticks = niceTicks(lo, hi, 4); lo = ticks[0]; hi = ticks[ticks.length - 1];
    const Y = (v) => pad.t + (h - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
    const bw = (w - pad.l - pad.r) / bars.length;
    ctx.font = `500 11.5px ${UIFONT}`;
    for (const t of ticks) { const y = Math.round(Y(t)) + 0.5; ctx.strokeStyle = COL.grid; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.fillStyle = COL['ink-3']; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('₹' + (t / 1e7).toFixed(t >= 1e9 ? 0 : 1) + ' cr', pad.l - 8, y); }
    bars.forEach((b, i) => {
      const x = pad.l + i * bw + bw * 0.16, ww = bw * 0.68;
      const top = Y(Math.max(b.a, b.b)), bot = Y(Math.min(b.a, b.b)); const hh = Math.max(1.5, bot - top);
      ctx.fillStyle = b.kind === 'total' ? COL.ink : (b.value > 0 ? COL.bad : COL.good);
      ctx.fillRect(x, top, ww, hh);
      if (i < bars.length - 1) { ctx.strokeStyle = COL['ink-3']; ctx.setLineDash([2, 2]); ctx.beginPath(); const yy = Y(b.kind === 'total' ? b.value : b.b) + 0.5; ctx.moveTo(x + ww, yy); ctx.lineTo(x + bw, yy); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = COL.ink; ctx.font = `600 11px ${UIFONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const txt = b.kind === 'total' ? inr(b.value) : (Math.abs(b.value) < 5e3 ? '0' : signedInr(b.value));
      ctx.fillText(txt, x + ww / 2, top - 4);
      ctx.fillStyle = COL['ink-2']; ctx.font = `500 11px ${UIFONT}`; ctx.textBaseline = 'top';
      const words = b.label.split(' '); let line = '', ly = h - pad.b + 8;
      for (const wd of words) { const test = line ? line + ' ' + wd : wd; if (ctx.measureText(test).width > bw - 4 && line) { ctx.fillText(line, x + ww / 2, ly); ly += 13; line = wd; } else line = test; }
      ctx.fillText(line, x + ww / 2, ly);
    });
  }

  /* ================= SUMMARY (title block + vitals) ================= */
  function cls(delta, higherIsBetter, eps) {
    if (Math.abs(delta) <= (eps || 1e-9)) return 'flat';
    return (delta > 0) === higherIsBetter ? 'good' : 'bad';
  }
  function renderSummary() {
    const d = App.draft, b = App.baseline, r = d.result, br = b.result;
    if (!r) return;
    const isBase = sameLevers(d.levers, b.levers);
    $('#scenName').textContent = isBase ? 'Baseline' : d.name;
    const dt = r.total - br.total;
    const [num, unit] = r.total >= 1e7 ? [(r.total / 1e7).toFixed(1), 'cr'] : [(r.total / 1e5).toFixed(1), 'L'];
    const deltaTxt = isBase ? 'This is your baseline' : (Math.abs(dt) < 5e4 ? 'Same cost as baseline' : `${signedInr(dt)} (${dt > 0 ? '+' : '−'}${pct(Math.abs(dt) / br.total)}) vs baseline`);
    $('#cartouche').innerHTML = `<div class="sname"><span>${isBase ? 'Baseline' : esc(d.name)}</span><span>${d.origin === 'copilot' && !isBase ? 'Copilot, approved' : ''}</span></div>
      <div class="big num">₹${num}<small>${unit}</small></div>
      <div class="sub">a year to make, move, store and take back ${n0(r.kpi.annualUnits / 1e5 * 10) / 10 >= 1 ? (r.kpi.annualUnits / 1e5).toFixed(1) + ' lakh' : n0(r.kpi.annualUnits)} units</div>
      <span class="delta ${isBase ? 'flat' : cls(dt, false, 5e4)}">${deltaTxt}</span>`;
    const s = d.sim, bs = b.sim;
    const openNames = (res) => res.open.map(j => App.data.dcs[j].name);
    const added = openNames(r).filter(n => !openNames(br).includes(n)), removed = openNames(br).filter(n => !openNames(r).includes(n));
    const netDiff = [added.map(n => '+' + n).join(', '), removed.map(n => '−' + n).join(', ')].filter(Boolean).join('  ');
    const V = [
      { k: 'Fill rate (simulated)', v: pct(s.fillRate, 1), dv: s.fillRate - bs.fillRate, f: x => (x > 0 ? '+' : '−') + Math.abs(x * 100).toFixed(2) + ' pts', hib: true, eps: 5e-5 },
      { k: 'Inventory held', v: inr(r.kpi.inventoryValue), dv: r.kpi.inventoryValue - br.kpi.inventoryValue, f: signedInr, hib: false, eps: 5e4 },
      { k: 'DCs in use', v: String(r.kpi.openDCs), dv: 0, text: netDiff || null },
      { k: 'Line-haul trucks a week', v: (r.kpi.trucksPerWeek).toFixed(1), dv: r.kpi.trucksPerWeek - br.kpi.trucksPerWeek, f: x => (x > 0 ? '+' : '−') + Math.abs(x).toFixed(1), hib: false, eps: 0.05 },
      { k: 'Demand within a day of a DC', v: pct(r.kpi.oneDayShare, 0), dv: r.kpi.oneDayShare - br.kpi.oneDayShare, f: x => (x > 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1) + ' pts', hib: true, eps: 5e-4 },
      { k: 'CO₂ from trucking, est.', v: n0(r.kpi.co2Tonnes) + ' t', dv: r.kpi.co2Tonnes - br.kpi.co2Tonnes, f: x => (x > 0 ? '+' : '−') + n0(Math.abs(x)) + ' t', hib: false, eps: 0.5 }
    ];
    $('#vitals').innerHTML = V.map(x => {
      let dline = '';
      if (!isBase) {
        if (x.text) dline = `<div class="d">${esc(x.text)}</div>`;
        else if (x.f && Math.abs(x.dv) > (x.eps || 0)) dline = `<div class="d ${cls(x.dv, x.hib, x.eps)}">${x.f(x.dv)} vs baseline</div>`;
      }
      return `<div class="vital"><div class="k">${x.k}</div><div class="v">${x.v}</div>${dline}</div>`;
    }).join('');
  }

  /* ================= LEVERS ================= */
  function renderLevers() {
    const box = $('#levers'); box.innerHTML = '';
    const groups = {};
    for (const L of LEVERS) (groups[L.group] = groups[L.group] || []).push(L);
    for (const [g, list] of Object.entries(groups)) {
      const grp = el('div', { class: 'lever-group' }, el('h3', { text: g }));
      for (const L of list) {
        const id = 'lv-' + L.key;
        const inp = el('input', { type: 'range', id, min: L.min, max: L.max, step: L.step, 'aria-describedby': id + '-h' });
        inp.addEventListener('input', () => { App.draft.levers[L.key] = +inp.value; markDraftEdited(); syncLever(L); scheduleRecompute(320); });
        grp.append(el('div', { class: 'lever' },
          el('div', { class: 'lever-top' }, el('label', { for: id, text: L.label }), el('output', { id: id + '-o', for: id })),
          inp, el('div', { class: 'hint', id: id + '-h', text: L.hint })));
      }
      box.append(grp);
    }
    const plan = el('div', { class: 'lever-group' }, el('h3', { text: 'Planning' }));
    plan.append(el('div', { class: 'lever-row' }, el('span', { text: 'Forecast method' }), el('div', { id: 'seg-fm' })));
    plan.append(el('div', { class: 'lever-row' }, el('span', { text: 'Season-aware buffers' }), el('div', { id: 'seg-sb' })));
    box.append(plan);
    box.append(el('div', { class: 'lever-actions' }, el('button', { class: 'btn small quiet', type: 'button', text: 'Back to baseline', onclick: resetDraft })));
    syncLevers();
  }
  function syncLever(L) {
    const inp = $('#lv-' + L.key); if (!inp) return; const v = App.draft.levers[L.key];
    inp.value = v; inp.style.setProperty('--fill', ((v - L.min) / (L.max - L.min) * 100) + '%');
    const o = $('#lv-' + L.key + '-o'); o.textContent = L.fmt(v); o.classList.toggle('changed', Math.abs(v - App.baseline.levers[L.key]) > 1e-9);
  }
  function syncLevers() {
    LEVERS.forEach(syncLever);
    const fm = $('#seg-fm'); if (fm) { fm.replaceWith(seg([['smart', 'Smart'], ['naive', 'Last year']], App.draft.levers.forecastMethod, v => { App.draft.levers.forecastMethod = v; markDraftEdited(); syncLevers(); scheduleRecompute(40); }, 'Forecast method', 'seg-fm')); }
    const sb = $('#seg-sb'); if (sb) { sb.replaceWith(seg([[true, 'On'], [false, 'Off']], App.draft.levers.seasonalBuffers, v => { App.draft.levers.seasonalBuffers = v; markDraftEdited(); syncLevers(); runSimOnly(); }, 'Season-aware buffers', 'seg-sb')); }
  }
  function seg(options, current, onPick, label, id) {
    const box = el('div', { class: 'seg', role: 'group', 'aria-label': label, id });
    for (const [val, text] of options) {
      const b = el('button', { type: 'button', 'aria-pressed': String(val === current), text });
      b.addEventListener('click', () => onPick(val)); box.append(b);
    }
    return box;
  }
  function markDraftEdited() {
    if (App.draft.origin !== 'manual' || App.draft.name === 'Baseline') { App.draft.origin = 'manual'; App.draft.name = 'Working draft'; }
  }
  function resetDraft() {
    App.draft = { name: 'Baseline', levers: clone(App.baseline.levers), result: App.baseline.result, sim: App.baseline.sim, origin: 'baseline' };
    syncLevers(); MapView.setResult(App.draft.result, App.draft.levers, null); renderSummary(); renderTab(); save();
    setStatus('Back on the baseline');
  }

  let recomputeTimer = null;
  function scheduleRecompute(delay) { clearTimeout(recomputeTimer); setStatus('Re-planning…', true); recomputeTimer = setTimeout(recomputeDraft, delay == null ? 300 : delay); }
  async function recomputeDraft() {
    setStatus('Checking every network design…', true); await frame();
    try {
      const t0 = performance.now(); const prev = App.draft.result ? new Set(App.draft.result.open) : null;
      const { res, sim } = runScenario(App.draft.levers);
      App.draft.result = res; App.draft.sim = sim; App.fvCache = null;
      const ms = Math.round(performance.now() - t0);
      setStatus(`Costed ${n0(res.search.evaluated)} network designs and ran ${App.simReps} simulations in ${ms} ms`);
      MapView.setResult(res, App.draft.levers, prev); renderSummary(); renderTab(); save();
    } catch (err) { console.error(err); setStatus('Could not solve this scenario: ' + (err && err.message || err)); }
  }
  async function runSimOnly() {
    setStatus('Simulating 52 weeks…', true); await frame();
    App.draft.sim = T.simulate(App.data, App.fc, App.draft.levers, App.draft.result, { reps: App.simReps });
    setStatus(`Ran ${App.simReps} simulations of the next 52 weeks`);
    MapView.setResult(App.draft.result, App.draft.levers, null); renderSummary(); renderTab(); save();
  }

  /* ================= TABS ================= */
  const TABS = {};
  function switchTab(t) {
    App.tab = t; $$('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t))); renderTab();
  }
  function renderTab() {
    const p = $('#tabpanel'); p.innerHTML = '';
    try { TABS[App.tab](p); } catch (err) { console.error(err); p.append(el('div', { class: 'empty', text: 'This view hit an error: ' + (err && err.message) })); }
  }
  function head(p, title, text, right) {
    p.append(el('div', { class: 'tab-head' }, el('div', {}, el('h2', { text: title }), text ? el('p', { text }) : null), right || null));
  }
  function selectEl(options, current, onChange, attrs) {
    const s = el('select', attrs || {});
    for (const [v, t] of options) { const o = el('option', { value: v, text: t }); if (String(v) === String(current)) o.selected = true; s.append(o); }
    s.addEventListener('change', () => onChange(s.value)); return s;
  }
  const field = (label, control) => el('label', { class: 'field' }, el('span', { text: label }), control);
  function keyrow(items) { return el('div', { class: 'keyrow' }, items.map(([c, t, dashed]) => el('span', {}, el('i', { style: { background: dashed ? 'transparent' : c, borderTop: dashed ? `2px dashed ${c}` : '', height: dashed ? '0' : '3px' } }), t))); }
  function stat(v, k) { return el('div', { class: 'stat' }, el('div', { class: 'v', text: v }), el('div', { class: 'k', text: k })); }
  function tableHtml(cols, rows) {
    return `<div class="scroll-x"><table class="tbl"><thead><tr>${cols.map(c => `<th class="${c.r ? 'r' : ''}">${c.t}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  const dcName = (id) => (App.data.dcs.find(d => d.id === id) || {}).name || id;
  const custName = (id) => (App.data.customers.find(d => d.id === id) || {}).name || id;
  const plantName = (id) => (App.data.plants.find(d => d.id === id) || {}).name || id;

  /* ---------- Forecast ---------- */
  function forecastValue() {
    if (App.fvCache) return App.fvCache;
    const r = App.draft.result; const L1 = clone(App.draft.levers), L2 = clone(App.draft.levers); L1.forecastMethod = 'smart'; L2.forecastMethod = 'naive';
    const a = T.evaluate(T.prepare(App.data, App.fc, L1), r.open, true), b = T.evaluate(T.prepare(App.data, App.fc, L2), r.open, true);
    App.fvCache = { ssSmart: a.kpi.ssValue, ssNaive: b.kpi.ssValue, holdSmart: a.comp.holding, holdNaive: b.comp.holding };
    return App.fvCache;
  }
  TABS.forecast = (p) => {
    const D = App.data, fc = App.fc; if (!App.fcSel.sku || !D.products.find(x => x.id === App.fcSel.sku)) App.fcSel.sku = D.products[0].id;
    if (App.fcSel.loc !== 'ALL' && !D.customers.find(c => c.id === App.fcSel.loc)) App.fcSel.loc = 'ALL';
    head(p, 'Forecast', 'Weekly demand history for each product and place, and the forecast the network is planned on. Accuracy is measured one week ahead over the last 52 weeks.');
    const sku = App.fcSel.sku, loc = App.fcSel.loc;
    p.append(el('div', { class: 'controls' },
      field('Product', selectEl(D.products.map(x => [x.id, x.name]), sku, v => { App.fcSel.sku = v; renderTab(); })),
      field('Demand point', selectEl([['ALL', 'All demand points'], ...D.customers.map(c => [c.id, c.name])], loc, v => { App.fcSel.loc = v; renderTab(); }))));
    const g = el('div', { class: 'grid' }); p.append(g);
    const left = el('div', { class: 'panel span-8' }); g.append(left);
    const keys = loc === 'ALL' ? D.customers.map(c => c.id + '|' + sku) : [loc + '|' + sku];
    const Hn = D.meta.weeksHistory, n = Hn + 52;
    const hist = new Array(n).fill(null), fit = new Array(n).fill(null), fS = new Array(n).fill(null), fN = new Array(n).fill(null), lo = new Array(n).fill(null), hi = new Array(n).fill(null);
    let varS = 0;
    for (const k of keys) {
      const y = D.history[k.split('|')[0]][sku], s = fc.series[k];
      for (let t = 0; t < Hn; t++) { hist[t] = (hist[t] || 0) + y[t]; }
      for (let h = 0; h < 52; h++) { fS[Hn + h] = (fS[Hn + h] || 0) + s.fc.smart[h]; fN[Hn + h] = (fN[Hn + h] || 0) + s.fc.naive[h]; }
      varS += s.sigma.smart * s.sigma.smart;
    }
    const sd = Math.sqrt(varS); let mean = 0; for (let h = 0; h < 52; h++) mean += fS[Hn + h] / 52;
    for (let h = 0; h < 52; h++) { const sc = Math.max(0.35, fS[Hn + h] / (mean || 1)); lo[Hn + h] = Math.max(0, fS[Hn + h] - 1.2816 * sd * sc); hi[Hn + h] = fS[Hn + h] + 1.2816 * sd * sc; }
    fS[Hn - 1] = hist[Hn - 1]; fN[Hn - 1] = hist[Hn - 1];
    const prod = D.products.find(x => x.id === sku);
    left.append(el('h3', { text: `${prod.name}, ${loc === 'ALL' ? 'all demand points' : custName(loc)}, units per week` }));
    const cb = el('div', { class: 'chartbox' }), cv = el('canvas'); cb.append(cv); left.append(cb);
    left.append(keyrow([[COL.ink, 'History'], [COL.flow, 'Smart forecast, 80% range shaded'], [COL['ink-3'], 'Same week last year', true]]));
    requestAnimationFrame(() => lineChart(cv, {
      n, height: 300, yFmt: v => n0(v), yFloor: 0,
      xTicks: [{ i: 0, label: '2 years ago' }, { i: Hn - 52, label: '1 year ago' }, { i: Hn - 1, label: 'Now' }, { i: Hn + 25, label: '+26 wks' }, { i: n - 1, label: '+52 wks' }],
      vlines: [{ i: Hn - 1, label: 'Forecast starts', color: '--ink-2' }],
      series: [
        { y: hist, color: '--ink', width: 1.4 },
        { y: fN, color: '--ink-3', width: 1.4, dash: [5, 4] },
        { y: fS, color: '--flow', width: 2.4, band: { lo, hi }, bandAlpha: 0.15 }
      ]
    }));
    const right = el('div', { class: 'panel span-4' }); g.append(right);
    right.append(el('h3', { text: 'Accuracy, last 52 weeks' }));
    right.append(el('p', { class: 'lead', text: 'WMAPE is error as a share of volume (lower is better). Bias above zero means over-forecasting.' }));
    const rows = D.products.map(x => { const m = fc.products[x.id]; return `<tr><td>${esc(x.name)}</td><td class="r">${pct(m.wmape.smart, 0)}</td><td class="r">${pct(m.wmape.naive, 0)}</td><td class="r">${(m.bias.smart >= 0 ? '+' : '−') + pct(Math.abs(m.bias.smart), 1)}</td><td class="r"><b>${pct(m.fva, 0)}</b></td></tr>`; });
    right.insertAdjacentHTML('beforeend', tableHtml([{ t: 'Product' }, { t: 'Smart', r: 1 }, { t: 'Last year', r: 1 }, { t: 'Bias', r: 1 }, { t: 'Error cut', r: 1 }], rows));
    const fv = forecastValue(); const dSS = fv.ssNaive - fv.ssSmart, dH = fv.holdNaive - fv.holdSmart;
    const using = App.draft.levers.forecastMethod;
    right.append(el('div', { class: 'callout', style: { marginTop: '16px' }, html: using === 'smart'
      ? `Planning on last year's numbers instead would need <b>${inr(dSS)}</b> more safety stock in this network, costing <b>${inr(dH)}</b> a year to carry.`
      : `You are planning on last year's numbers. The smart forecast would free <b>${inr(dSS)}</b> of safety stock and save <b>${inr(dH)}</b> a year.` }));
  };

  /* ---------- Network ---------- */
  TABS.network = (p) => {
    const r = App.draft.result, D = App.data, L = App.draft.levers;
    head(p, 'Network', 'Which DCs to run and who each one serves. Every combination of candidate DCs is costed in full, with goods routed by a min-cost flow model, so the design shown is the cheapest one rather than a rule-of-thumb guess.');
    const g = el('div', { class: 'grid' }); p.append(g);
    const a = el('div', { class: 'panel span-7' }); g.append(a);
    a.append(el('h3', { text: 'Distribution centres' }));
    a.append(el('p', { class: 'lead', text: 'Lock a DC open or closed to test a decision the optimizer would not make on its own. Load units (lu) measure truck space: an AC takes 3, a fan 0.6.' }));
    const tbl = el('table', { class: 'tbl' });
    tbl.innerHTML = `<thead><tr><th>DC</th><th>Control</th><th class="r">Throughput</th><th>Utilisation</th><th class="r">Demand pts</th><th class="r">Avg km</th><th class="r">Fixed cost</th></tr></thead>`;
    const tb = el('tbody'); tbl.append(tb);
    D.dcs.forEach((d) => {
      const info = r.dcs.find(x => x.id === d.id);
      const lanes = r.secondaryLanes.filter(l => l.from === d.id); const vol = lanes.reduce((s, l) => s + l.slotsWk, 0);
      const avgKm = vol ? lanes.reduce((s, l) => s + l.km * l.slotsWk, 0) / vol : 0;
      const tr = el('tr', { class: info ? '' : 'closed' });
      tr.append(el('td', {}, el('b', { text: d.name }), info ? null : el('span', { class: 'sub', text: 'not used' })));
      const ctl = el('td'); ctl.append(seg([['auto', 'Auto'], ['open', 'Open'], ['closed', 'Closed']], L.locks[d.id] || 'auto', v => {
        if (v === 'auto') delete L.locks[d.id]; else L.locks[d.id] = v; markDraftEdited(); scheduleRecompute(40);
      }, 'Control for ' + d.name)); tr.append(ctl);
      tr.append(el('td', { class: 'r', text: info ? n0(info.throughput) + ' lu/wk' : '—' }));
      const ub = el('td'); if (info) { const u = info.util; ub.append(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, el('div', { class: 'ubar', style: { flex: '1' } }, el('i', { class: u > 0.9 ? 'hot' : '', style: { width: Math.min(100, u * 100) + '%' } })), el('span', { text: pct(u, 0) }))); } else ub.textContent = '—'; tr.append(ub);
      tr.append(el('td', { class: 'r', text: info ? String(r.assign.filter(x => x === d.id).length) : '—' }));
      tr.append(el('td', { class: 'r', text: info ? n0(avgKm) : '—' }));
      tr.append(el('td', { class: 'r', text: inr(d.fixedCost * L.dcFixedIndex) }));
      tb.append(tr);
    });
    a.append(el('div', { class: 'scroll-x' }, tbl));
    const b = el('div', { class: 'panel span-5' }); g.append(b);
    b.append(el('h3', { text: 'Where the money goes' }));
    const total = r.total; const comps = COMP.filter(([k]) => Math.abs(r.comp[k]) > 1).sort((x, y) => r.comp[y[0]] - r.comp[x[0]]);
    b.append(el('div', { class: 'stack' }, comps.map(([k, , c]) => el('div', { title: k, style: { width: Math.max(0, r.comp[k] / total * 100) + '%', background: c } }))));
    b.insertAdjacentHTML('beforeend', `<div class="stacklist">${comps.map(([k, lab, c]) => `<i style="background:${c};border:1px solid var(--line)"></i><span>${lab}</span><span>${inr(r.comp[k])}</span><span class="muted">${pct(r.comp[k] / total, 0)}</span>`).join('')}</div>`);
    b.append(el('p', { class: 'lead', style: { marginTop: '14px' }, text: `${inr(r.kpi.totalPerUnit, 0)} per unit sold, or ${pct(r.kpi.costToServePct, 1)} of product value.` }));
    const c = el('div', { class: 'panel span-12' }); g.append(c);
    c.append(el('h3', { text: 'Next-best designs' }));
    const best = r.alternatives[0].total;
    const gap2 = r.alternatives[1] ? (r.alternatives[1].total - best) / best : null;
    c.append(el('p', { class: 'lead', text: gap2 != null && gap2 < 0.01 ? `The runner-up costs only ${pct(gap2, 2)} more. When designs are this close, choose on things the model can't see: land, labour, lease terms and risk.` : 'How much more the closest alternative designs would cost.' }));
    const rows = r.alternatives.map((alt, i) => `<tr><td>${i === 0 ? '<b>Chosen</b>' : '#' + (i + 1)}</td><td>${alt.open.map(id => esc(dcName(id))).join(', ')}</td><td class="r">${alt.open.length}</td><td class="r">${inr(alt.total, 2)}</td><td class="r">${i === 0 ? '—' : '+' + inr(alt.total - best, 2).replace('₹', '₹') + ' (' + pct((alt.total - best) / best, 2) + ')'}</td></tr>`);
    c.insertAdjacentHTML('beforeend', tableHtml([{ t: 'Rank' }, { t: 'DCs used' }, { t: 'Count', r: 1 }, { t: 'Annual cost', r: 1 }, { t: 'Gap to best', r: 1 }], rows));
    c.append(el('p', { class: 'muted', style: { marginTop: '10px', fontSize: '12.5px' }, text: `Search: ${r.search.freeDCs} DCs free to open or close, ${n0(r.search.configs)} combinations, ${n0(r.search.evaluated)} costed in full.` }));
  };

  /* ---------- Inventory ---------- */
  TABS.inventory = (p) => {
    const r = App.draft.result, D = App.data, L = App.draft.levers;
    head(p, 'Inventory', 'How much stock each DC holds and why. Safety stock covers forecast error over the lead time plus review period; cycle stock is half of each replenishment; pipeline stock is on the truck.');
    const k = r.kpi;
    p.append(el('div', { class: 'statrow' }, stat(inr(k.inventoryValue), 'Total inventory value'), stat(inr(k.ssValue), 'Safety stock'), stat(inr(k.cycleValue), 'Cycle stock'), stat(inr(k.pipeValue), 'In transit'), stat(inr(r.comp.holding), `To carry a year at ${pct(L.holdingRate, 0)}`)));
    p.append(el('div', { class: 'callout', style: { marginBottom: '22px' }, html: `If every demand point kept its own buffer, safety stock would be <b>${inr(k.decentralSS)}</b>. Pooling demand into ${k.openDCs} DCs brings it to <b>${inr(k.ssValue)}</b>, ${pct(1 - k.ssValue / k.decentralSS, 0)} less, because random swings in different cities partly cancel out.` }));
    const g = el('div', { class: 'grid' }); p.append(g);
    const a = el('div', { class: 'panel span-5' }); g.append(a); a.append(el('h3', { text: 'Stock by DC' }));
    const maxV = Math.max(...r.dcs.map(d => d.ssValue + d.cycleValue + d.pipeValue), 1);
    for (const d of r.dcs) {
      const tot = d.ssValue + d.cycleValue + d.pipeValue;
      a.append(el('div', { style: { margin: '10px 0' } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' } }, el('b', { text: dcName(d.id) }), el('span', { class: 'num', text: inr(tot) })),
        el('div', { class: 'stack', style: { height: '14px', width: (tot / maxV * 100) + '%', marginTop: '4px' } },
          el('div', { style: { width: d.ssValue / tot * 100 + '%', background: 'var(--flow)' } }), el('div', { style: { width: d.cycleValue / tot * 100 + '%', background: 'var(--plant)' } }), el('div', { style: { width: d.pipeValue / tot * 100 + '%', background: 'var(--ink-3)' } }))));
    }
    a.append(keyrow([[COL.flow, 'Safety'], [COL.plant, 'Cycle'], [COL['ink-3'], 'In transit']]));
    const b = el('div', { class: 'panel span-7' }); g.append(b); b.append(el('h3', { text: 'Policy by DC and product' }));
    b.append(el('p', { class: 'lead', text: 'Each DC reviews stock every R weeks and orders up to cover lead time L plus R. R is chosen by trading holding cost against trucking and ordering cost.' }));
    const rows = r.inv.map(x => `<tr><td>${esc(dcName(x.dc))}</td><td>${esc(D.products.find(q => q.id === x.sku).name)}</td><td class="r">${n0(x.mu)}</td><td class="r">${n0(x.sigma)}</td><td class="r">${x.L}</td><td class="r">${x.R}</td><td class="r">${n0(x.ss)}</td><td class="r">${n0(x.cycle)}</td><td class="r">${inr(x.value)}</td></tr>`);
    b.insertAdjacentHTML('beforeend', tableHtml([{ t: 'DC' }, { t: 'Product' }, { t: 'Demand/wk', r: 1 }, { t: 'Error σ/wk', r: 1 }, { t: 'L wks', r: 1 }, { t: 'R wks', r: 1 }, { t: 'Safety', r: 1 }, { t: 'Cycle', r: 1 }, { t: 'Value', r: 1 }], rows));
  };

  /* ---------- Transport ---------- */
  TABS.transport = (p) => {
    const r = App.draft.result, k = r.kpi;
    head(p, 'Transport', 'Line-haul moves full trucks from plants to DCs; last-mile moves part loads from DCs to customers. Shipping less often fills trucks better but raises cycle stock, and the model balances the two for every DC.');
    p.append(el('div', { class: 'statrow' }, stat(k.trucksPerWeek.toFixed(1), 'Line-haul trucks a week'), stat(pct(k.primaryUtil, 0), 'Average truck fill'), stat(inr(r.comp.primary), 'Line-haul a year'), stat(inr(r.comp.secondary), 'Last-mile a year'), stat(n0(k.avgKm) + ' km', 'Average delivery distance'), stat(n0(k.co2Tonnes) + ' t', 'CO₂ a year, est.')));
    const g = el('div', { class: 'grid' }); p.append(g);
    const a = el('div', { class: 'panel span-6' }); g.append(a); a.append(el('h3', { text: 'Line-haul lanes' }));
    const rows = r.primaryLanes.slice().sort((x, y) => y.costYr - x.costYr).map(l => `<tr><td>${esc(plantName(l.from))} to ${esc(dcName(l.to))}</td><td class="r">${n0(l.km)}</td><td class="r">${n0(l.slotsWk)}</td><td class="r">${l.everyWeeks === 1 ? 'weekly' : 'every ' + l.everyWeeks + ' wks'}</td><td class="r">${l.trucksPerShipment}</td><td class="r">${pct(l.util, 0)}</td><td class="r">${inr(l.costYr)}</td></tr>`);
    a.insertAdjacentHTML('beforeend', tableHtml([{ t: 'Lane' }, { t: 'Km', r: 1 }, { t: 'lu/wk', r: 1 }, { t: 'Ships', r: 1 }, { t: 'Trucks', r: 1 }, { t: 'Fill', r: 1 }, { t: 'Cost/yr', r: 1 }], rows));
    const b = el('div', { class: 'panel span-6' }); g.append(b); b.append(el('h3', { text: 'Costliest last-mile lanes' }));
    b.append(el('p', { class: 'lead', text: `${pct(k.oneDayShare, 0)} of demand sits within a day's drive of its DC.` }));
    const rows2 = r.secondaryLanes.slice().sort((x, y) => y.costYr - x.costYr).slice(0, 12).map(l => `<tr><td>${esc(dcName(l.from))} to ${esc(custName(l.to))}</td><td class="r">${n0(l.km)}</td><td class="r">${n0(l.slotsWk)}</td><td class="r">${inr(l.costYr)}</td></tr>`);
    b.insertAdjacentHTML('beforeend', tableHtml([{ t: 'Lane' }, { t: 'Km', r: 1 }, { t: 'lu/wk', r: 1 }, { t: 'Cost/yr', r: 1 }], rows2));
  };

  /* ---------- Returns ---------- */
  TABS.returns = (p) => {
    const r = App.draft.result, R = r.returns, D = App.data, L = App.draft.levers;
    head(p, 'Returns', 'Returned units travel back to their DC, are consolidated, and go by truck to the returns hub for refurbishment or scrap. The cost counts freight, processing and the value lost on each return, less what refurbishment recovers.');
    p.append(el('div', { class: 'statrow' }, stat(n0(R.units), 'Units returned a year'), stat(inr(R.net), 'Net cost of returns'), stat(inr(R.freight), 'Reverse freight'), stat(inr(R.processing), 'Processing'), stat(inr(R.writeoff), 'Value written off'), stat(inr(R.recovery), 'Recovered by refurbishing')));
    const ctl = el('div', { class: 'controls' });
    const hubOpts = T.CITIES.map(c => [c.name, c.name]);
    const curHub = (T.CITIES.find(c => Math.abs(c.lat - D.returnsHub.lat) < 0.3 && Math.abs(c.lon - D.returnsHub.lon) < 0.3) || {}).name || 'Nagpur';
    ctl.append(field('Returns hub location', selectEl(hubOpts, curHub, v => {
      const c = T.CITIES.find(x => x.name === v); D.returnsHub = { name: c.name + ' returns hub', lat: c.lat, lon: c.lon };
      App.dataVersion++; logAudit('You', `Moved the returns hub to ${c.name}`); rerunAll();
    })));
    ctl.append(field('On the map', seg([[true, 'Show return flows'], [false, 'Hide']], App.showReturns, v => { App.showReturns = v; MapView.kick(); renderTab(); }, 'Return flows on map')));
    p.append(ctl);
    const g = el('div', { class: 'grid' }); p.append(g);
    const a = el('div', { class: 'panel span-6' }); g.append(a); a.append(el('h3', { text: 'Flows to the hub' }));
    a.insertAdjacentHTML('beforeend', tableHtml([{ t: 'From DC' }, { t: 'Units/yr', r: 1 }, { t: 'lu/yr', r: 1 }, { t: 'Km to hub', r: 1 }], R.byDC.map(x => `<tr><td>${esc(dcName(x.id))}</td><td class="r">${n0(x.units)}</td><td class="r">${n0(x.slots)}</td><td class="r">${n0(x.kmToHub)}</td></tr>`)));
    const b = el('div', { class: 'panel span-6' }); g.append(b); b.append(el('h3', { text: 'Return rules by product' }));
    b.append(el('p', { class: 'lead', text: `Return rates are multiplied by the Return rate lever, now ${LEVER.returnIndex.fmt(L.returnIndex)}. Edit the base rates in Your data.` }));
    b.insertAdjacentHTML('beforeend', tableHtml([{ t: 'Product' }, { t: 'Return rate', r: 1 }, { t: 'Refurbishable', r: 1 }, { t: 'Resale value', r: 1 }, { t: 'Processing/unit', r: 1 }],
      D.products.map(x => `<tr><td>${esc(x.name)}</td><td class="r">${pct(x.returnRate * L.returnIndex, 1)}</td><td class="r">${pct(x.refurbShare, 0)}</td><td class="r">${pct(x.recovery, 0)}</td><td class="r">${inr(x.processing)}</td></tr>`)));
  };

  /* ---------- Simulate ---------- */
  TABS.simulate = (p) => {
    const D = App.data, L = App.draft.levers, s = App.draft.sim, r = App.draft.result;
    head(p, 'Simulate', 'Plays the chosen network and stock policy forward week by week for a year, with random demand, many times over. This is where a plan that looks fine on paper gets stress-tested.');
    const ctl = el('div', { class: 'controls' });
    const plantSel = selectEl([['', 'No outage'], ...D.plants.map(x => [x.id, x.name + ' plant'])], L.outage.plantId || '', v => { L.outage.plantId = v; markDraftEdited(); runSimOnly(); });
    const start = el('input', { type: 'number', min: 1, max: 52, value: (L.outage.startWeek | 0) + 1, style: { width: '80px' } });
    start.addEventListener('change', () => { L.outage.startWeek = clamp((+start.value | 0) - 1, 0, 51); markDraftEdited(); runSimOnly(); });
    const dur = el('input', { type: 'number', min: 1, max: 12, value: L.outage.weeks | 0, style: { width: '80px' } });
    dur.addEventListener('change', () => { L.outage.weeks = clamp(+dur.value | 0, 1, 12); markDraftEdited(); runSimOnly(); });
    ctl.append(field('Plant outage', plantSel), field('Starts in week', start), field('Lasts (weeks)', dur),
      field('During an outage', seg([[true, 'Reroute to next plant'], [false, 'Wait for restart']], L.reroute, v => { L.reroute = v; markDraftEdited(); runSimOnly(); }, 'Outage response')),
      field('Simulation runs', selectEl([[10, '10'], [30, '30'], [100, '100']], App.simReps, v => { App.simReps = +v; runSimOnly(); })));
    p.append(ctl);
    const avgSO = s.perDC.reduce((a, d) => a + d.skus.reduce((b, x) => b + x.stockoutWeeks, 0), 0) / Math.max(1, s.perDC.reduce((a, d) => a + d.skus.length, 0));
    p.append(el('div', { class: 'statrow' }, stat(pct(s.fillRate, 2), 'Fill rate, by value'), stat(inr(s.avgInventory), 'Average stock on hand'), stat(avgSO.toFixed(1), 'Weeks with a stockout, per DC and product'),
      s.outage ? stat(n0(s.rerouted), 'Units rerouted') : null, s.outage ? stat(inr(s.expediteCost), 'Extra freight from rerouting') : null));
    const g = el('div', { class: 'grid' }); p.append(g);
    const shade = s.outage ? [{ from: s.outage.start, to: Math.min(51, s.outage.end), label: plantName(s.outage.plant) + ' down' }] : [];
    const a = el('div', { class: 'panel span-6' }); g.append(a); a.append(el('h3', { text: 'Weekly fill rate' }));
    const c1 = el('canvas'), b1 = el('div', { class: 'chartbox' }, c1); a.append(b1);
    a.append(keyrow([[COL.flow, 'Median run, 10th to 90th percentile shaded']]));
    const b = el('div', { class: 'panel span-6' }); g.append(b); b.append(el('h3', { text: 'Stock on hand, by value' }));
    const c2 = el('canvas'), b2 = el('div', { class: 'chartbox' }, c2); b.append(b2);
    b.append(keyrow([[COL.plant, 'Median run, 10th to 90th percentile shaded']]));
    const xt = [{ i: 0, label: 'Wk 1' }, { i: 12, label: 'Wk 13' }, { i: 25, label: 'Wk 26' }, { i: 38, label: 'Wk 39' }, { i: 51, label: 'Wk 52' }];
    requestAnimationFrame(() => {
      lineChart(c1, { n: 52, height: 240, yFmt: v => (v * 100).toFixed(1) + '%', yMax: 1, xTicks: xt, shade,
        series: [{ y: s.fill.map(x => x.p50), color: '--flow', width: 2, band: { lo: s.fill.map(x => x.p10), hi: s.fill.map(x => x.p90) } }] });
      lineChart(c2, { n: 52, height: 240, yFmt: v => '₹' + (v / 1e7).toFixed(1) + ' cr', yFloor: 0, xTicks: xt, shade,
        series: [{ y: s.inv.map(x => x.p50), color: '--plant', width: 2, band: { lo: s.inv.map(x => x.p10), hi: s.inv.map(x => x.p90) } }] });
    });
    const c = el('div', { class: 'panel span-7' }); g.append(c); c.append(el('h3', { text: 'Fill rate by DC and product' }));
    const target = L.serviceLevel;
    const heat = (f) => { const bad = f < target; const a2 = clamp((target - f) * 8, 0, 0.55); return `<span class="heat" style="background:${bad ? alpha(COL.bad, 0.12 + a2) : alpha(COL.good, 0.12)};color:${bad ? COL.bad : COL.good}">${pct(f, 1)}</span>`; };
    c.insertAdjacentHTML('beforeend', tableHtml([{ t: 'DC' }, ...D.products.map(x => ({ t: esc(x.name), r: 1 }))],
      s.perDC.map(d => `<tr><td>${esc(dcName(d.id))}</td>${d.skus.map(x => `<td class="r">${heat(x.fill)}</td>`).join('')}</tr>`)));
    const v = el('div', { class: 'panel span-5' }); g.append(v); v.append(el('h3', { text: 'Does the model agree with itself?' }));
    const formula = r.kpi.ssValue + r.kpi.cycleValue; const gap = (s.avgInventory - formula) / formula;
    v.append(el('p', { class: 'lead', html: `The formulas say DCs should average <b>${inr(formula)}</b> of stock (safety plus cycle). The simulation averaged <b>${inr(s.avgInventory)}</b>, a gap of ${pct(Math.abs(gap), 1)}. ${Math.abs(gap) < 0.05 ? 'Close agreement: the inventory maths holds up under random demand.' : 'A gap this size usually means seasonality or an outage the formulas do not see.'}` }));
    v.append(el('p', { class: 'lead', text: `A ${pct(target, 1)} service target means a DC should run short in about ${(52 * (1 - target)).toFixed(1)} weeks a year per product. The simulation shows ${avgSO.toFixed(1)}.` }));
  };

  /* ---------- Compare ---------- */
  function allScenarios() {
    const list = [{ id: 'base', name: 'Baseline', levers: App.baseline.levers, result: App.baseline.result, sim: App.baseline.sim, fixed: true }];
    if (!sameLevers(App.draft.levers, App.baseline.levers) && !App.pinned.some(pn => sameLevers(pn.levers, App.draft.levers))) list.push({ id: 'draft', name: App.draft.name, levers: App.draft.levers, result: App.draft.result, sim: App.draft.sim, fixed: true });
    return list.concat(App.pinned);
  }
  async function ensurePinnedFresh() {
    let changed = false;
    for (const sc of App.pinned) {
      if (sc.result && sc.ver === App.dataVersion) continue;
      setStatus(`Re-solving ${sc.name}…`, true); await frame();
      const { res, sim } = runScenario(sc.levers); sc.result = res; sc.sim = sim; sc.ver = App.dataVersion; changed = true;
    }
    if (changed) { setStatus('Pinned scenarios re-solved with your current data'); renderTab(); }
  }
  TABS.compare = (p) => {
    head(p, 'Compare', 'Side by side against the baseline. Pin a scenario from the top bar to add it here; only you can promote one to be the new baseline.');
    if (App.pinned.some(sc => !sc.result || sc.ver !== App.dataVersion)) { p.append(el('div', { class: 'empty', text: 'Re-solving pinned scenarios with your latest data…' })); ensurePinnedFresh(); return; }
    const list = allScenarios();
    if (list.length < 2) { p.append(el('div', { class: 'empty', text: 'Nothing to compare yet. Move a lever, then press Pin as scenario. Or ask the copilot for a what-if.' })); return; }
    const base = list[0];
    const metrics = [
      ['Annual cost', s => s.result.total, inr, false], ['Cost per unit', s => s.result.kpi.totalPerUnit, x => inr(x, 0), false], ['DCs in use', s => s.result.kpi.openDCs, x => String(x), null],
      ['Inventory', s => s.result.kpi.inventoryValue, inr, false], ['Fill rate', s => s.sim.fillRate, x => pct(x, 2), true, x => (x * 100).toFixed(2) + ' pts'], ['Trucks a week', s => s.result.kpi.trucksPerWeek, x => x.toFixed(1), false],
      ['Within a day', s => s.result.kpi.oneDayShare, x => pct(x, 0), true, x => (x * 100).toFixed(1) + ' pts'], ['CO₂, est.', s => s.result.kpi.co2Tonnes, x => n0(x) + ' t', false],
      ...COMP.map(([k, lab]) => [lab, s => s.result.comp[k], inr, false])
    ];
    const head2 = `<tr><th>Metric</th>${list.map(s => `<th class="r">${esc(s.name)}</th>`).join('')}</tr>`;
    const body = metrics.map(([lab, f, fmt, hib, dfm]) => `<tr><td>${lab}</td>${list.map((s, i) => {
      const v = f(s), bv = f(base); const d = v - bv;
      const dl = i === 0 || hib === null || Math.abs(d) < 1e-6 * Math.max(1, Math.abs(bv)) ? '' : `<div style="font-size:11.5px;color:${(d > 0) === hib ? 'var(--good)' : 'var(--bad)'}">${typeof bv === 'number' && Math.abs(bv) > 1e4 ? signedInr(d) : (d > 0 ? '+' : '−') + ((dfm || fmt)(Math.abs(d)))}</div>`;
      return `<td class="r">${fmt(v)}${dl}</td>`;
    }).join('')}</tr>`).join('');
    const g = el('div', { class: 'grid' }); p.append(g);
    const a = el('div', { class: 'panel span-12' }); g.append(a); a.append(el('h3', { text: 'Scenarios' }));
    a.insertAdjacentHTML('beforeend', `<div class="scroll-x"><table class="tbl"><thead>${head2}</thead><tbody>${body}</tbody></table></div>`);
    if (App.pinned.length) {
      const act = el('div', { style: { marginTop: '16px', display: 'grid', gap: '10px' } });
      for (const sc of App.pinned) {
        const name = el('input', { type: 'text', value: sc.name, 'aria-label': 'Scenario name', style: { maxWidth: '260px' } });
        name.addEventListener('change', () => { sc.name = name.value.trim() || sc.name; save(); renderTab(); });
        act.append(el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, name,
          el('button', { class: 'btn small quiet', type: 'button', text: 'Open in levers', onclick: () => { App.draft = { name: sc.name, levers: clone(sc.levers), result: sc.result, sim: sc.sim, origin: sc.origin || 'manual' }; syncLevers(); MapView.setResult(sc.result, App.draft.levers, null); renderSummary(); renderTab(); toast(`Opened ${sc.name}`); } }),
          el('button', { class: 'btn small quiet', type: 'button', text: 'Make baseline', onclick: () => promote(sc) }),
          el('button', { class: 'btn small quiet', type: 'button', text: 'Remove', onclick: () => { App.pinned = App.pinned.filter(x => x !== sc); save(); renderTab(); } })));
      }
      a.append(act);
    }
    const others = list.slice(1);
    if (!App.compareSel || !others.find(s => s.id === App.compareSel)) App.compareSel = others[0].id;
    const sel = others.find(s => s.id === App.compareSel);
    const b = el('div', { class: 'panel span-12' }); g.append(b);
    b.append(el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '8px' } },
      el('h3', { text: 'What moved the cost' }), field('Scenario', selectEl(others.map(s => [s.id, s.name]), App.compareSel, v => { App.compareSel = v; renderTab(); }))));
    const items = [{ label: 'Baseline', value: base.result.total, kind: 'total' }, ...COMP.map(([k, lab]) => ({ label: lab, value: sel.result.comp[k] - base.result.comp[k], kind: 'delta' })).filter(x => Math.abs(x.value) > 1e4), { label: sel.name, value: sel.result.total, kind: 'total' }];
    const cv = el('canvas'); const box = el('div', { class: 'chartbox', style: { minWidth: '640px' } }, cv); b.append(el('div', { class: 'scroll-x' }, box));
    const bn = base.result.open.map(j => App.data.dcs[j].name), sn = sel.result.open.map(j => App.data.dcs[j].name);
    const add = sn.filter(x => !bn.includes(x)), rem = bn.filter(x => !sn.includes(x));
    b.append(el('p', { class: 'lead', style: { marginTop: '10px' }, text: add.length || rem.length ? `Network change: ${add.length ? 'opens ' + add.join(', ') : ''}${add.length && rem.length ? '; ' : ''}${rem.length ? 'closes ' + rem.join(', ') : ''}.` : 'Same DCs as the baseline; the change comes from how goods and stock move.' }));
    requestAnimationFrame(() => waterfall(cv, items, 300));
  };

  /* ---------- Sweep ---------- */
  TABS.sweep = (p) => {
    head(p, 'Sweep', 'Runs the optimizer across a range of one lever, holding everything else at the working draft. The points where the best design changes are tipping points, and they are often the most useful numbers in a network study.');
    const cfg = App.sweepCfg, Lv = LEVER[cfg.key];
    const ctl = el('div', { class: 'controls' });
    const from = el('input', { type: 'number', step: 'any', value: +(cfg.from * Lv.disp).toFixed(3), style: { width: '100px' } });
    const to = el('input', { type: 'number', step: 'any', value: +(cfg.to * Lv.disp).toFixed(3), style: { width: '100px' } });
    const steps = el('input', { type: 'number', min: 3, max: 15, value: cfg.steps, style: { width: '80px' } });
    const runBtn = el('button', { class: 'btn primary', type: 'button', text: 'Run sweep' });
    const stopBtn = el('button', { class: 'btn quiet', type: 'button', text: 'Stop', hidden: true });
    ctl.append(field('Lever', selectEl(LEVERS.map(l => [l.key, l.label]), cfg.key, v => { const l = LEVER[v]; App.sweepCfg = { key: v, from: l.min, to: l.max, steps: 9 }; App.sweep = null; renderTab(); })),
      field(`From (${Lv.unit})`, from), field(`To (${Lv.unit})`, to), field('Steps', steps), runBtn, stopBtn);
    p.append(ctl);
    runBtn.addEventListener('click', async () => {
      App.sweepCfg.from = clamp(+from.value / Lv.disp, Lv.min, Lv.max); App.sweepCfg.to = clamp(+to.value / Lv.disp, Lv.min, Lv.max); App.sweepCfg.steps = clamp(+steps.value | 0, 3, 15);
      runBtn.disabled = true; stopBtn.hidden = false; stopBtn.onclick = () => { App.sweepStop = true; };
      await runSweep(); runBtn.disabled = false; stopBtn.hidden = true;
    });
    const sw = App.sweep;
    if (!sw || sw.key !== cfg.key) { p.append(el('div', { class: 'empty', text: `Choose a range for ${Lv.label.toLowerCase()} and press Run sweep. Each step re-solves the whole network design, so 10 steps take a few seconds.` })); return; }
    const g = el('div', { class: 'grid' }); p.append(g);
    const a = el('div', { class: 'panel span-12' }); g.append(a); a.append(el('h3', { text: `Annual cost as ${Lv.label.toLowerCase()} changes` }));
    const tips = [];
    for (let i = 1; i < sw.rows.length; i++) if (sw.rows[i].open.join() !== sw.rows[i - 1].open.join()) tips.push(i);
    const cv = el('canvas'); a.append(el('div', { class: 'chartbox' }, cv));
    const keyc = el('p', { class: 'lead', style: { marginTop: '10px' } }); a.append(keyc);
    keyc.textContent = tips.length ? `Dashed lines mark tipping points: ${tips.length} change${tips.length > 1 ? 's' : ''} of design across this range. Numbers over the points are DCs in use.` : `No tipping point in this range: the same ${sw.rows[0].nOpen} DCs stay best throughout. Your design is robust to this lever.`;
    requestAnimationFrame(() => lineChart(cv, {
      n: sw.rows.length, height: 300, yFmt: v => '₹' + (v / 1e7).toFixed(1) + ' cr',
      xTicks: sw.rows.map((r, i) => ({ i, label: Lv.fmt(r.value) })).filter((_, i, arr) => arr.length <= 9 || i % 2 === 0 || i === arr.length - 1),
      vlines: tips.map(i => ({ i: i - 0.5, color: '--flow' })),
      labels: sw.rows.map((r, i) => ({ i, v: r.total, text: String(r.nOpen), color: '--ink-2' })),
      series: [{ y: sw.rows.map(r => r.total), color: '--ink', width: 2, points: true, pointColor: sw.rows.map((r, i) => tips.includes(i) ? '--flow' : '--ink') }]
    }));
    const t = el('div', { class: 'panel span-12' }); g.append(t); t.append(el('h3', { text: 'Results' }));
    t.insertAdjacentHTML('beforeend', tableHtml([{ t: Lv.label }, { t: 'Annual cost', r: 1 }, { t: 'DCs', r: 1 }, { t: 'Design' }, { t: 'Inventory', r: 1 }],
      sw.rows.map((r, i) => `<tr><td>${Lv.fmt(r.value)}${tips.includes(i) ? ' <span class="pill on">tipping point</span>' : ''}</td><td class="r">${inr(r.total, 2)}</td><td class="r">${r.nOpen}</td><td>${r.open.map(id => esc(dcName(id))).join(', ')}</td><td class="r">${inr(r.kpi.inventoryValue)}</td></tr>`)));
  };
  async function runSweep() {
    const cfg = App.sweepCfg, Lv = LEVER[cfg.key]; App.sweepStop = false;
    const vals = []; for (let i = 0; i < cfg.steps; i++) { const v = cfg.from + (cfg.to - cfg.from) * i / (cfg.steps - 1); vals.push(Lv.step >= 1 ? Math.round(v) : +v.toFixed(4)); }
    const rows = [];
    for (let i = 0; i < vals.length; i++) {
      if (App.sweepStop) break;
      setStatus(`Sweep ${i + 1} of ${vals.length}: ${Lv.label.toLowerCase()} ${Lv.fmt(vals[i])}`, true); await frame();
      const L = clone(App.draft.levers); L[cfg.key] = vals[i];
      const r = T.optimize(App.data, App.fc, L);
      rows.push({ value: vals[i], total: r.total, open: r.open.map(j => App.data.dcs[j].id), nOpen: r.open.length, kpi: r.kpi });
    }
    App.sweep = { key: cfg.key, rows };
    setStatus(App.sweepStop ? `Sweep stopped after ${rows.length} steps` : `Sweep done: ${rows.length} full network solves`);
    if (App.tab === 'sweep') renderTab();
    return App.sweep;
  }

  /* ---------- Your data ---------- */
  function markDirty() { App.dirty = true; const bar = $('#dirtybar'); if (bar) bar.hidden = false; }
  TABS.data = (p) => {
    head(p, 'Your data', 'Replace the demo with your own business: locations, capacities, costs, products and past demand. Changes are applied together when you press Apply changes.');
    const subs = [['plants', 'Plants'], ['dcs', 'DCs'], ['customers', 'Demand points'], ['products', 'Products'], ['costs', 'Costs'], ['history', 'Demand history'], ['io', 'Save and share']];
    const nav = el('div', { class: 'subnav' });
    for (const [k, t] of subs) nav.append(el('button', { type: 'button', 'aria-pressed': String(App.dataSub === k), text: t, onclick: () => { App.dataSub = k; renderTab(); } }));
    p.append(nav);
    const box = el('div', { class: 'panel' }); p.append(box);
    DATA_SUBS[App.dataSub](box);
    const bar = el('div', { class: 'dirtybar', id: 'dirtybar', hidden: !App.dirty },
      el('span', { text: 'You have changes that are not in the plan yet.' }),
      el('div', { style: { display: 'flex', gap: '8px' } },
        el('button', { class: 'btn small', type: 'button', text: 'Discard', onclick: discardData }),
        el('button', { class: 'btn small primary', type: 'button', text: 'Apply changes', onclick: applyData })));
    p.append(bar);
  };
  let dataSnapshot = null;
  function snapshotData() { if (!App.dirty) dataSnapshot = clone(App.data); }
  function discardData() { if (dataSnapshot) App.data = dataSnapshot; dataSnapshot = null; App.dirty = false; renderTab(); toast('Changes discarded'); }
  async function applyData() {
    setStatus('Re-forecasting and re-planning with your data…', true); await frame();
    try {
      App.fc = T.forecast(App.data); App.dataVersion++; App.dirty = false; dataSnapshot = null;
      logAudit('You', 'Applied data changes'); await rerunAll(); toast('Your data is in the plan');
    } catch (err) { console.error(err); setStatus('Could not apply: ' + err.message); }
  }
  async function rerunAll() {
    setStatus('Re-planning baseline and draft…', true); await frame();
    const b = runScenario(App.baseline.levers); App.baseline.result = b.res; App.baseline.sim = b.sim;
    if (sameLevers(App.draft.levers, App.baseline.levers)) { App.draft.result = b.res; App.draft.sim = b.sim; }
    else { const d = runScenario(App.draft.levers); App.draft.result = d.res; App.draft.sim = d.sim; }
    App.fvCache = null; App.sweep = null;
    MapView.rebuild(); MapView.setResult(App.draft.result, App.draft.levers, null); MapView.replayReveal();
    renderSummary(); renderTab(); save(); setStatus('Plan updated');
  }
  function numInput(obj, key, opts) {
    const o = opts || {}; const disp = o.disp || 1;
    const inp = el('input', { type: 'number', step: 'any', value: +(obj[key] * disp).toFixed(o.dp == null ? 4 : o.dp), 'aria-label': o.label || key });
    inp.addEventListener('change', () => { const v = +inp.value; if (!isFinite(v)) return; snapshotData(); obj[key] = v / disp; markDirty(); });
    return inp;
  }
  function textInput(obj, key, label) {
    const inp = el('input', { type: 'text', value: obj[key], 'aria-label': label || key });
    inp.addEventListener('change', () => { snapshotData(); obj[key] = inp.value.trim() || obj[key]; markDirty(); });
    return inp;
  }
  function addNodeRow(kind) {
    const wrap = el('div', { class: 'controls', style: { marginTop: '14px' } });
    const city = selectEl([['', 'Pick a city'], ...T.CITIES.map(c => [c.name, c.name])], '', () => {});
    const lat = el('input', { type: 'number', step: 'any', placeholder: 'Latitude', style: { width: '110px' } }), lon = el('input', { type: 'number', step: 'any', placeholder: 'Longitude', style: { width: '110px' } });
    const name = el('input', { type: 'text', placeholder: 'Name (optional)', style: { width: '160px' } });
    city.addEventListener('change', () => { const c = T.CITIES.find(x => x.name === city.value); if (c) { lat.value = c.lat; lon.value = c.lon; if (!name.value) name.value = c.name; } });
    const btn = el('button', { class: 'btn small', type: 'button', text: { plants: 'Add plant', dcs: 'Add DC', customers: 'Add demand point' }[kind] });
    btn.addEventListener('click', () => {
      const la = +lat.value, lo = +lon.value; if (!isFinite(la) || !isFinite(lo) || (!lat.value && !lon.value)) { toast('Pick a city or enter latitude and longitude'); return; }
      snapshotData();
      const arr = App.data[kind], prefix = { plants: 'P', dcs: 'D', customers: 'C' }[kind];
      let k = arr.length + 1; while (arr.find(x => x.id === prefix + k)) k++;
      const nm = name.value.trim() || city.value || `${prefix}${k}`;
      if (kind === 'plants') arr.push({ id: prefix + k, name: nm, lat: la, lon: lo, capacity: 6000, varCost: 30 });
      if (kind === 'dcs') arr.push({ id: prefix + k, name: nm, lat: la, lon: lo, fixedCost: 1.8e7, capacity: 5000, handling: 18 });
      if (kind === 'customers') arr.push({ id: prefix + k, name: nm, lat: la, lon: lo, weight: 2 });
      if (kind === 'dcs' && App.data.dcs.length > 11) toast('More than 11 candidate DCs makes every solve slower; lock some open or closed to keep it quick');
      markDirty(); renderTab();
    });
    wrap.append(field('City', city), field('Latitude', lat), field('Longitude', lon), field('Name', name), btn);
    return wrap;
  }
  function delBtn(arr, item, minLen) {
    return el('button', { class: 'btn small quiet', type: 'button', text: 'Remove', onclick: () => { if (arr.length <= minLen) { toast('Keep at least ' + minLen); return; } snapshotData(); arr.splice(arr.indexOf(item), 1); markDirty(); renderTab(); } });
  }
  function editTable(cols, arr, rowFn) {
    const t = el('table', { class: 'tbl' }); t.innerHTML = `<thead><tr>${cols.map(c => `<th class="${c.r ? 'r' : ''}">${c.t}</th>`).join('')}</tr></thead>`;
    const tb = el('tbody'); for (const it of arr) { const tr = el('tr'); rowFn(it).forEach(c => tr.append(el('td', {}, c))); tb.append(tr); } t.append(tb);
    return el('div', { class: 'scroll-x' }, t);
  }
  const DATA_SUBS = {
    plants(b) {
      b.append(el('h3', { text: 'Plants' }), el('p', { class: 'lead', text: 'Capacity in load units a week. Dispatch cost is per load unit leaving the plant.' }));
      b.append(editTable([{ t: 'Name' }, { t: 'Latitude' }, { t: 'Longitude' }, { t: 'Capacity lu/wk' }, { t: 'Dispatch ₹/lu' }, { t: '' }], App.data.plants,
        x => [textInput(x, 'name'), numInput(x, 'lat'), numInput(x, 'lon'), numInput(x, 'capacity', { dp: 0 }), numInput(x, 'varCost'), delBtn(App.data.plants, x, 1)]));
      b.append(addNodeRow('plants'));
    },
    dcs(b) {
      b.append(el('h3', { text: 'Distribution centres' }), el('p', { class: 'lead', text: 'Every DC here is a candidate; the optimizer decides which to use. Fixed cost is rent and staff a year, in ₹ lakh.' }));
      b.append(editTable([{ t: 'Name' }, { t: 'Latitude' }, { t: 'Longitude' }, { t: 'Fixed ₹ lakh/yr' }, { t: 'Capacity lu/wk' }, { t: 'Handling ₹/lu' }, { t: '' }], App.data.dcs,
        x => [textInput(x, 'name'), numInput(x, 'lat'), numInput(x, 'lon'), numInput(x, 'fixedCost', { disp: 1e-5, dp: 1 }), numInput(x, 'capacity', { dp: 0 }), numInput(x, 'handling'), delBtn(App.data.dcs, x, 1)]));
      b.append(addNodeRow('dcs'));
    },
    customers(b) {
      b.append(el('h3', { text: 'Demand points' }), el('p', { class: 'lead', text: 'Market weight sets each place\'s share when demand history is synthetic. If you upload history, the history decides.' }));
      b.append(editTable([{ t: 'Name' }, { t: 'Latitude' }, { t: 'Longitude' }, { t: 'Market weight' }, { t: '' }], App.data.customers,
        x => [textInput(x, 'name'), numInput(x, 'lat'), numInput(x, 'lon'), numInput(x, 'weight'), delBtn(App.data.customers, x, 1)]));
      b.append(addNodeRow('customers'));
    },
    products(b) {
      b.append(el('h3', { text: 'Products' }), el('p', { class: 'lead', text: 'Value drives holding cost and write-offs. Load units set truck space. Base demand, variability and season only shape synthetic history.' }));
      b.append(editTable([{ t: 'Name' }, { t: 'Value ₹' }, { t: 'Load units' }, { t: 'Base demand/wk' }, { t: 'Variability' }, { t: 'Season' }, { t: 'Return %' }, { t: 'Refurb %' }, { t: 'Resale %' }, { t: 'Processing ₹' }, { t: '' }], App.data.products,
        x => {
          const s = selectEl([['flat', 'None'], ['summer', 'Summer'], ['winter', 'Winter'], ['monsoon', 'Monsoon'], ['festive', 'Festive']], x.season, v => { snapshotData(); x.season = v; markDirty(); });
          return [textInput(x, 'name'), numInput(x, 'value', { dp: 0 }), numInput(x, 'cube'), numInput(x, 'baseWeekly', { dp: 0 }), numInput(x, 'cv'), s, numInput(x, 'returnRate', { disp: 100, dp: 2 }), numInput(x, 'refurbShare', { disp: 100, dp: 1 }), numInput(x, 'recovery', { disp: 100, dp: 1 }), numInput(x, 'processing', { dp: 0 }), delBtn(App.data.products, x, 1)];
        }));
      b.append(el('div', { class: 'controls', style: { marginTop: '14px' } }, el('button', { class: 'btn small', type: 'button', text: 'Add product', onclick: () => {
        snapshotData(); let k = App.data.products.length + 1; while (App.data.products.find(x => x.id === 'K' + k)) k++;
        App.data.products.push({ id: 'K' + k, name: 'New product', value: 5000, cube: 1, baseWeekly: 2000, cv: 0.4, season: 'flat', amp: 0.8, trend: 0.08, northBias: 1, returnRate: 0.03, refurbShare: 0.5, recovery: 0.3, processing: 300 });
        markDirty(); renderTab();
      } }), el('button', { class: 'btn small quiet', type: 'button', text: 'Regenerate synthetic history', onclick: () => { snapshotData(); App.data.history = null; App.data.meta.historySource = 'synthetic'; App.data.meta.weeksHistory = 104; markDirty(); toast('Synthetic history will be rebuilt from these settings when you apply'); } })));
    },
    costs(b) {
      const C = App.data.costs;
      b.append(el('h3', { text: 'Cost and operating assumptions' }), el('p', { class: 'lead', text: 'These feed every scenario. Levers multiply some of them; the values here are today.' }));
      const rows = [
        ['ftlPerKm', 'Full truck rate', '₹ per km'], ['truckCapacity', 'Truck capacity', 'load units'], ['targetFill', 'Planning truck fill', 'share, 0 to 1'],
        ['ltlPerSlotKm', 'Last-mile rate', '₹ per load unit per km'], ['dropPerSlot', 'Last-mile drop charge', '₹ per load unit'], ['roadFactor', 'Road distance factor', '× straight line'],
        ['speedKmDay', 'Truck distance a day', 'km'], ['orderCost', 'Cost per replenishment order', '₹'], ['lostSalePenalty', 'Lost sale penalty', '₹ per load unit'],
        ['reversePremium', 'Reverse freight premium', '× forward rate'], ['co2PerTruckKm', 'CO₂ per truck km', 'kg'], ['ltlCo2Factor', 'Last-mile CO₂ factor', '× full truck']
      ];
      b.append(editTable([{ t: 'Assumption' }, { t: 'Value' }, { t: 'Unit' }], rows, ([k, lab, unit]) => [el('span', { text: lab }), numInput(C, k, { label: lab }), el('span', { class: 'muted', text: unit })]));
    },
    history(b) {
      const m = App.data.meta;
      b.append(el('h3', { text: 'Demand history' }));
      b.append(el('p', { class: 'lead', html: `Now using <b>${m.historySource === 'uploaded' ? 'your uploaded history' : 'synthetic history'}</b>, ${m.weeksHistory} weeks ending week ${m.historyEndWoy + 1} of the year. Paste CSV with columns <code>location,product,week,units</code>. Location and product can be names or IDs. Week counts up from 1, oldest first; give at least 60 weeks.` }));
      const ta = el('textarea', { rows: 8, placeholder: 'location,product,week,units\nMumbai,Inverter AC,1,812\nMumbai,Inverter AC,2,790' });
      const file = el('input', { type: 'file', accept: '.csv,text/csv,text/plain' });
      file.addEventListener('change', () => { const f = file.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { ta.value = String(rd.result); }; rd.readAsText(f); });
      const endWk = el('input', { type: 'number', min: 1, max: 52, value: 41, style: { width: '90px' } });
      const out = el('div', { style: { marginTop: '10px', fontSize: '13.5px' } });
      const load = el('button', { class: 'btn small primary', type: 'button', text: 'Load history' });
      load.addEventListener('click', () => {
        const res = parseHistoryCsv(ta.value, clamp(+endWk.value | 0, 1, 52) - 1);
        out.innerHTML = res.ok ? `<span style="color:var(--good)">${esc(res.msg)}</span>` : `<span style="color:var(--bad)">${esc(res.msg)}</span>`;
        if (res.ok) { markDirty(); }
      });
      b.append(el('div', { class: 'controls' }, field('CSV file', file), field('Last row is week of year', endWk)), ta, el('div', { class: 'controls', style: { marginTop: '10px' } }, load), out);
    },
    io(b) {
      b.append(el('h3', { text: 'Save and share' }));
      b.append(el('p', { class: 'lead', text: 'This page remembers your model in this browser. Export it to keep a copy or move it to another machine.' }));
      const exp = el('button', { class: 'btn small', type: 'button', text: 'Export model', onclick: exportModel });
      const imp = el('button', { class: 'btn small quiet', type: 'button', text: 'Import model', onclick: importModel });
      const reset = el('button', { class: 'btn small quiet', type: 'button', text: 'Reset to demo data', onclick: async () => {
        App.data = T.defaultData(); App.fc = T.forecast(App.data); App.dataVersion++; App.dirty = false; App.baseline.levers = T.defaultLevers();
        App.draft = { name: 'Baseline', levers: T.defaultLevers(), origin: 'baseline' }; App.pinned = []; logAudit('You', 'Reset to demo data'); syncLevers(); await rerunAll();
      } });
      b.append(el('div', { class: 'controls' }, exp, imp, reset));
    }
  };
  function parseHistoryCsv(text, endWoy) {
    const D = App.data; const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return { ok: false, msg: 'Paste some CSV first.' };
    const rows = []; const issues = new Set();
    const byName = (arr, v) => arr.find(x => x.id.toLowerCase() === v.toLowerCase() || x.name.toLowerCase() === v.toLowerCase());
    for (const ln of lines) {
      const parts = ln.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      if (parts.length < 4) continue; const wk = +parts[2], u = +parts[3];
      if (!isFinite(wk) || !isFinite(u)) continue;
      const c = byName(D.customers, parts[0]), p = byName(D.products, parts[1]);
      if (!c) { issues.add('Unknown location: ' + parts[0]); continue; } if (!p) { issues.add('Unknown product: ' + parts[1]); continue; }
      rows.push({ c: c.id, p: p.id, wk: wk | 0, u: Math.max(0, u) });
    }
    if (!rows.length) return { ok: false, msg: 'No usable rows. ' + [...issues].slice(0, 3).join('; ') };
    const maxWk = Math.max(...rows.map(r => r.wk)), minWk = Math.min(...rows.map(r => r.wk));
    const N = maxWk - minWk + 1;
    if (N < 60) return { ok: false, msg: `Found ${N} weeks. The forecast needs at least 60 to see a full season.` };
    if (N > 156) return { ok: false, msg: `Found ${N} weeks. Use the most recent 156 weeks at most.` };
    snapshotData();
    const old = D.history; D.history = {}; D.meta.weeksHistory = N; D.meta.historyEndWoy = endWoy;
    const seen = new Set();
    for (const c of D.customers) { D.history[c.id] = {}; for (const p of D.products) D.history[c.id][p.id] = new Array(N).fill(0); }
    for (const r of rows) { D.history[r.c][r.p][r.wk - minWk] += r.u; seen.add(r.c + '|' + r.p); }
    let filled = 0;
    for (const c of D.customers) for (const p of D.products) if (!seen.has(c.id + '|' + p.id)) { delete D.history[c.id][p.id]; filled++; }
    T.ensureHistory(D);
    D.meta.historySource = 'uploaded';
    const msg = `Loaded ${n0(rows.length)} rows covering ${N} weeks.` + (filled ? ` ${filled} location and product pairs had no rows, so they use synthetic history.` : '') + (issues.size ? ' Skipped: ' + [...issues].slice(0, 3).join('; ') : '');
    void old; return { ok: true, msg: msg + ' Press Apply changes to re-plan.' };
  }
  function exportPayload() { return JSON.stringify({ app: 'tributary', version: 1, data: App.data, baselineLevers: App.baseline.levers, pinned: App.pinned.map(p => ({ name: p.name, levers: p.levers })) }); }
  async function exportModel() {
    const json = exportPayload();
    if (App.downloads) {
      try { await App.downloads.save({ filename: 'tributary-model.json', data: json }); toast('Model exported'); return; }
      catch (e) { if (e && e.code === 'declined') return; }
    }
    modal('Export model', 'Copy this JSON and keep it somewhere safe.', json, null);
  }
  function importModel() {
    modal('Import model', 'Paste a model exported from Tributary.', '', async (text) => {
      try {
        const obj = JSON.parse(text); if (!obj || obj.app !== 'tributary' || !obj.data) throw new Error('Not a Tributary model');
        App.data = obj.data; App.fc = T.forecast(App.data); App.dataVersion++;
        App.baseline.levers = normaliseLevers(obj.baselineLevers); App.draft = { name: 'Baseline', levers: clone(App.baseline.levers), origin: 'baseline' };
        App.pinned = (obj.pinned || []).map((p, i) => ({ id: 'pin' + Date.now() + i, name: p.name, levers: normaliseLevers(p.levers), origin: 'manual' }));
        logAudit('You', 'Imported a model'); syncLevers(); await rerunAll(); toast('Model imported');
        return true;
      } catch (e) { toast('Could not import: ' + e.message); return false; }
    });
  }
  function modal(title, text, value, onOk) {
    const back = el('div', { class: 'modal-back' });
    const ta = el('textarea', {}); ta.value = value;
    const close = () => back.remove();
    const okBtn = onOk ? el('button', { class: 'btn small primary', type: 'button', text: 'Import', onclick: async () => { if (await onOk(ta.value)) close(); } }) : null;
    back.append(el('div', { class: 'modal', role: 'dialog', 'aria-label': title }, el('h3', { text: title }), el('p', { class: 'lead', text }), ta,
      el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, el('button', { class: 'btn small quiet', type: 'button', text: 'Close', onclick: close }), okBtn)));
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.body.append(back); ta.focus(); if (value) ta.select();
  }

  /* ---------- How it works ---------- */
  TABS.method = (p) => {
    head(p, 'How it works', 'Every number on this page comes from the models below. Nothing is a black box: each step can be checked by hand.');
    p.append(el('div', { class: 'method', html: METHOD_HTML }));
  };
  const METHOD_HTML = `
<h3>1. One run, start to finish</h3>
<p>Changing any lever sets off the same chain: forecast demand for every product at every demand point, choose the cheapest network design, size the stock each DC holds, plan trucks, cost the returns, then simulate the year to see whether the plan survives random demand. One parameter can ripple through every stage, which is why they are solved together rather than in separate spreadsheets.</p>
<h3>2. Forecasting</h3>
<p>Seasonality is estimated top-down: national weekly sales are divided by a fitted linear trend, averaged by week of year, smoothed, and scaled to average 1. Each demand point is then de-seasonalised and forecast with Holt's method (level and damped trend), with the smoothing constants picked per series by grid search.</p>
<span class="formula">forecast(h) = (level + (φ + φ² + … + φʰ) × trend) × season(week)        φ = 0.98</span>
<p>The comparison model is last year's same week. Accuracy is one-step-ahead over the last 52 weeks: WMAPE = Σ|error| / Σ actual, bias = Σ(forecast − actual) / Σ actual. The standard deviation of these errors (σ) is what sets safety stock, which is how a better forecast turns into less inventory and money.</p>
<h3>3. Network design</h3>
<p>Every combination of candidate DCs is evaluated (2ⁿ − 1 designs for n free DCs). For each design, goods are routed by a min-cost flow model: plants to DCs to demand points, respecting plant and DC capacity, with a lost-sale arc so the problem is always solvable. Flows minimise plant dispatch, line-haul, handling and last-mile cost.</p>
<span class="formula">line-haul ₹/lu = truck rate × road km ÷ (truck capacity × planning fill)
last-mile ₹/lu = (rate × road km + drop charge)        road km = straight-line km × road factor</span>
<p>Each design is then costed in full, including the parts a flow model cannot see because they are non-linear: safety stock pooling, truck rounding, ordering and returns. The cheapest total wins. Because the search is exhaustive, the answer is the true optimum of this model, and the runner-up designs show how flat the cost surface is near the top.</p>
<h3>4. Inventory</h3>
<p>Each DC reviews stock every R weeks and orders up to a level that covers the lead time L plus R, plus safety stock. Demand pooled at a DC adds in means, and its errors add in variance, which is the square-root law at work:</p>
<span class="formula">σ_DC = √(Σ share² × σ_city²)        SS = z × σ_DC × √(L + R)        z = Φ⁻¹(service level)
cycle stock = demand × R ÷ 2        in-transit stock = demand × transit days ÷ 7
holding cost = (SS + cycle + in transit) × value × holding rate</span>
<p>L is transit days plus handling days, rounded up to whole weeks. R (1 to 4 weeks) is chosen per DC to minimise cycle holding plus trucking plus ordering cost, so a higher holding rate pushes towards smaller, more frequent shipments.</p>
<h3>5. Transport</h3>
<p>Line-haul is costed truck by truck: each shipment of R weeks of volume needs ⌈volume ÷ capacity⌉ trucks, so half-empty trucks cost what they really cost. CO₂ is a planning estimate: truck-km × kg per km, with last-mile scaled by a load factor.</p>
<h3>6. Returns</h3>
<p>Returns = demand × return rate × lever. They travel back to their DC by part load at a premium, then by full truck to the hub. Net cost = reverse freight + processing + value written off − refurbishable share × resale value.</p>
<h3>7. Simulation</h3>
<p>For each DC and product, 52 weeks are simulated after an 8-week warm-up, with demand drawn around the seasonal forecast and noise that scales with the season. The order-up-to policy above is applied each review; unmet demand is lost. A plant outage blocks orders from that plant. With rerouting on, they go to the next-cheapest plant (longer lead time, extra freight), but only as far as that plant has spare capacity: what it can make in a week minus what it already ships in the chosen design. Spare capacity builds up week by week from the start of the outage, and orders placed in the same week share it in proportion to their size. Whatever does not fit waits for the restart, which is what happens to every order when rerouting is off.</p>
<span class="formula">spare (lu a week) = backup plant capacity − its average weekly flow in the design
rerouted from the start of the outage to week t ≤ spare × weeks since the outage began</span>
<p>Results are bands across runs, not single guesses. Season-aware buffers scale safety stock with the seasonal forecast instead of holding it flat.</p>
<h3>8. Copilot and human approval</h3>
<p>The copilot never changes the plan on its own. It translates a question into proposed lever changes and shows them to you first. Nothing runs until you approve, and you can edit the numbers before you do. After the run, Claude explains the result using only the numbers the model produced. Only you can make a scenario the new baseline. Every step is written to the decision log.</p>
<h3>9. Limits worth knowing</h3>
<ul>
<li>Network costs use average weekly volume; peak-season capacity is tested in the simulation, not in the design search.</li>
<li>Each DC orders all products on one cycle, and lead time comes from its main supplying plant.</li>
<li>Spare capacity for rerouting is measured against a plant's average weekly flow, not its seasonal peak.</li>
<li>Exhaustive search is exact but grows as 2ⁿ. Up to about 11 free candidate DCs stays quick; beyond that, lock some open or closed.</li>
<li>Demo data is synthetic. Rates are realistic for Indian road freight but are assumptions to replace with your own.</li>
</ul>`;

  /* ================= SCENARIO ACTIONS ================= */
  function pinDraft() {
    const k = App.pinned.length; const letter = String.fromCharCode(65 + (k % 26));
    const name = App.draft.origin === 'copilot' ? App.draft.name : `Scenario ${letter}`;
    App.pinned.push({ id: 'pin' + Date.now(), name, levers: clone(App.draft.levers), result: App.draft.result, sim: App.draft.sim, ver: App.dataVersion, origin: App.draft.origin });
    logAudit('You', `Pinned "${name}"`); save(); toast(`Pinned as ${name}. See it in Compare.`);
    if (App.tab === 'compare') renderTab();
  }
  function promote(sc) {
    const src = sc || App.draft;
    if (!sc && sameLevers(App.draft.levers, App.baseline.levers)) { toast('The working draft already matches the baseline'); return; }
    App.baseline = { levers: clone(src.levers), result: src.result, sim: src.sim };
    App.draft = { name: 'Baseline', levers: clone(src.levers), result: src.result, sim: src.sim, origin: 'baseline' };
    logAudit('You', `Made "${src.name}" the baseline`);
    syncLevers(); MapView.setResult(App.draft.result, App.draft.levers, null); renderSummary(); renderTab(); save();
    toast('New baseline set');
  }

  /* ================= COPILOT ================= */
  const cpLog = $('#cpLog');
  function openDrawer(open) {
    $('#drawer').classList.toggle('open', open); $('#scrim').classList.toggle('show', open && window.innerWidth < 900);
    $('#btnCopilot').setAttribute('aria-expanded', String(open)); if (open) setTimeout(() => $('#cpInput').focus(), 250);
  }
  function addMsg(kind, text) { const m = el('div', { class: 'msg ' + kind }); m.textContent = text; cpLog.append(m); cpLog.scrollTop = cpLog.scrollHeight; return m; }
  function renderAudit() { const ol = $('#auditList'); ol.innerHTML = App.audit.slice(-40).map(a => `<li><b>${esc(a.time)}</b> ${esc(a.actor)}: ${esc(a.action)}</li>`).join(''); }
  function quickChips() {
    const box = $('#cpChips'); box.innerHTML = '';
    const D = App.data; const topPlant = App.baseline.result.primaryLanes.reduce((m, l) => { m[l.from] = (m[l.from] || 0) + l.slotsWk; return m; }, {});
    const pBusy = Object.entries(topPlant).sort((a, b) => b[1] - a[1])[0]; const plant = D.plants.find(p => p.id === (pBusy ? pBusy[0] : D.plants[0].id));
    const firstDC = App.baseline.result.dcs.slice().sort((a, b) => a.throughput - b.throughput)[0];
    const Q = [
      ['Diesel up 15%', { interpretation: 'Freight rates rise 15% on line-haul and last-mile.', changes: [{ lever: 'freightIndex', value: 1.15 }] }],
      ['Holding cost to 40%', { interpretation: 'Capital gets expensive: holding cost rises to 40% of product value a year.', changes: [{ lever: 'holdingRate', value: 0.4 }] }],
      [`${plant.name} down 4 weeks`, { interpretation: `${plant.name} plant stops for 4 weeks from week 20, and its DCs reroute to the next plant.`, outage: { plantId: plant.id, startWeek: 19, weeks: 4, reroute: true } }],
      ['Demand up 25%', { interpretation: 'Demand runs 25% above forecast for the year.', changes: [{ lever: 'demandGrowth', value: 0.25 }] }],
      firstDC ? [`Close ${dcName(firstDC.id)}`, { interpretation: `Test the network without the ${dcName(firstDC.id)} DC.`, locks: [{ dc: firstDC.id, state: 'closed' }] }] : null,
      ['Next-day reach', { interpretation: 'Only serve customers within roughly a day of a DC (450 km by road).', changes: [{ lever: 'maxServiceKm', value: 450 }] }]
    ].filter(Boolean);
    for (const [label, prop] of Q) box.append(el('button', { class: 'chip', type: 'button', text: label, onclick: () => { addMsg('you', label); logAudit('You', `Asked for quick what-if "${label}"`); showProposal(validateProposal(prop), 'Quick what-if'); } }));
  }
  function leverCatalog() {
    return LEVERS.map(l => `${l.key}: ${l.label}. ${l.hint}. Range ${l.min} to ${l.max}. Current baseline ${App.baseline.levers[l.key]}.`).join('\n') +
      `\nforecastMethod: "smart" or "naive" (last year). Current ${App.baseline.levers.forecastMethod}.\nseasonalBuffers: true or false. Current ${App.baseline.levers.seasonalBuffers}.`;
  }
  function proposalPrompt(question) {
    const D = App.data, r = App.baseline.result;
    return `You are the scenario copilot inside a supply chain digital twin for an Indian business. Translate the planner's request into concrete model changes. You do not run anything: a human reviews and approves your proposal first.

Levers (key: meaning, allowed range, current baseline value). Index levers are multipliers where 1 means today, so "+15%" is 1.15. Rates like holdingRate and serviceLevel are fractions, so 30% is 0.3.
${leverCatalog()}

Plants (id: name): ${D.plants.map(p => `${p.id}: ${p.name}`).join(', ')}
DCs (id: name, status in baseline): ${D.dcs.map((d, j) => `${d.id}: ${d.name} (${r.open.includes(j) ? 'in use' : 'not used'})`).join(', ')}
Simulation weeks run 0 to 51 from next week.

Reply with only JSON in this shape:
{"interpretation": "one plain sentence saying what will be tested",
 "changes": [{"lever": "<key>", "value": <number or string or boolean>}],
 "locks": [{"dc": "<DC id>", "state": "open" | "closed" | "auto"}],
 "outage": null or {"plantId": "<plant id>", "startWeek": <0-51>, "weeks": <1-12>, "reroute": true or false},
 "sweep": null or {"lever": "<key>", "from": <number>, "to": <number>, "steps": <3-12>},
 "clarify": null or "one short question if the request cannot be mapped to these levers"}
Use a sweep only when the planner asks how something changes across a range, or asks for a tipping point or break-even. Leave arrays empty when not needed.

Planner request: ${JSON.stringify(question)}`;
  }
  function validateProposal(raw) {
    const D = App.data; const out = { interpretation: String((raw && raw.interpretation) || '').slice(0, 400), changes: [], locks: [], outage: null, sweep: null, clarify: raw && raw.clarify ? String(raw.clarify).slice(0, 300) : null };
    for (const c of (raw && raw.changes) || []) {
      const L = LEVER[c && c.lever];
      if (L) { const v = Number(c.value); if (isFinite(v)) out.changes.push({ lever: L.key, value: clamp(v, L.min, L.max) }); }
      else if (c && c.lever === 'forecastMethod' && (c.value === 'smart' || c.value === 'naive')) out.changes.push({ lever: 'forecastMethod', value: c.value });
      else if (c && c.lever === 'seasonalBuffers') out.changes.push({ lever: 'seasonalBuffers', value: c.value === true || c.value === 'true' });
    }
    for (const l of (raw && raw.locks) || []) {
      const d = D.dcs.find(x => x.id === (l && l.dc) || x.name.toLowerCase() === String(l && l.dc).toLowerCase());
      if (d && ['open', 'closed', 'auto'].includes(l.state)) out.locks.push({ dc: d.id, state: l.state });
    }
    const o = raw && raw.outage;
    if (o && o.plantId) { const pl = D.plants.find(x => x.id === o.plantId || x.name.toLowerCase() === String(o.plantId).toLowerCase()); if (pl) out.outage = { plantId: pl.id, startWeek: clamp(o.startWeek | 0, 0, 51), weeks: clamp((o.weeks | 0) || 4, 1, 12), reroute: o.reroute !== false }; }
    const s = raw && raw.sweep;
    if (s && LEVER[s.lever]) { const L = LEVER[s.lever]; let a = clamp(+s.from, L.min, L.max), b = clamp(+s.to, L.min, L.max); if (isFinite(a) && isFinite(b) && a !== b) out.sweep = { lever: L.key, from: Math.min(a, b), to: Math.max(a, b), steps: clamp(s.steps | 0 || 8, 3, 12) }; }
    return out;
  }
  function describeChange(c) {
    if (LEVER[c.lever]) return [LEVER[c.lever].label, LEVER[c.lever].fmt(App.baseline.levers[c.lever])];
    if (c.lever === 'forecastMethod') return ['Forecast method', App.baseline.levers.forecastMethod];
    return ['Season-aware buffers', App.baseline.levers.seasonalBuffers ? 'On' : 'Off'];
  }
  function showProposal(prop, source) {
    if (prop.clarify && !prop.changes.length && !prop.locks.length && !prop.outage && !prop.sweep) { addMsg('ai', prop.clarify); return; }
    if (!prop.changes.length && !prop.locks.length && !prop.outage && !prop.sweep) { addMsg('sys', 'That did not map to anything the model can change. Try naming a cost, a plant, a DC, demand or service.'); return; }
    const card = el('div', { class: 'card' });
    card.append(el('div', { class: 'gate', text: 'Approval 1 of 2: nothing has run yet' }), el('h4', { text: `Proposed by ${source}` }), el('div', { class: 'interp', text: prop.interpretation || 'Proposed scenario' }));
    const grid = el('div', { class: 'chg' }); const inputs = [];
    for (const c of prop.changes) {
      const [label, from] = describeChange(c);
      if (LEVER[c.lever]) {
        const L = LEVER[c.lever]; const inp = el('input', { type: 'number', step: 'any', value: +(c.value * L.disp).toFixed(3), 'aria-label': label + ' new value' });
        inputs.push(() => { const v = +inp.value; if (isFinite(v)) c.value = clamp(v / L.disp, L.min, L.max); });
        grid.append(el('span', { text: label }), el('span', { class: 'muted', text: 'from ' + from }), el('span', {}, inp, ' ' + (L.unit === '%' || L.unit === '% of today' ? '%' : L.unit)));
      } else grid.append(el('span', { text: label }), el('span', { class: 'muted', text: 'from ' + from }), el('b', { text: String(c.value) }));
    }
    for (const l of prop.locks) grid.append(el('span', { text: dcName(l.dc) + ' DC' }), el('span', { class: 'muted', text: 'lock' }), el('b', { text: { open: 'Keep open', closed: 'Close', auto: 'Let optimizer decide' }[l.state] }));
    if (prop.outage) grid.append(el('span', { text: plantName(prop.outage.plantId) + ' plant' }), el('span', { class: 'muted', text: `weeks ${prop.outage.startWeek + 1} to ${prop.outage.startWeek + prop.outage.weeks}` }), el('b', { text: prop.outage.reroute ? 'Down, reroute' : 'Down, wait' }));
    if (prop.sweep) { const L = LEVER[prop.sweep.lever]; grid.append(el('span', { text: 'Sweep ' + L.label.toLowerCase() }), el('span', { class: 'muted', text: `${prop.sweep.steps} steps` }), el('b', { text: `${L.fmt(prop.sweep.from)} to ${L.fmt(prop.sweep.to)}` })); }
    card.append(grid);
    const approve = el('button', { class: 'btn small primary', type: 'button', text: 'Approve and run' });
    const reject = el('button', { class: 'btn small quiet', type: 'button', text: 'Reject' });
    card.append(el('div', { class: 'acts' }, approve, reject));
    cpLog.append(card); cpLog.scrollTop = cpLog.scrollHeight;
    logAudit(source, `Proposed: ${prop.interpretation || 'scenario'}`);
    reject.addEventListener('click', () => { card.classList.add('done'); approve.disabled = reject.disabled = true; logAudit('You', 'Rejected the proposal'); addMsg('sys', 'Rejected. Nothing changed.'); });
    approve.addEventListener('click', async () => {
      inputs.forEach(f => f()); card.classList.add('done'); approve.disabled = reject.disabled = true;
      logAudit('You', 'Approved and ran: ' + (prop.interpretation || 'scenario'));
      await runApproved(prop);
    });
  }
  async function runApproved(prop) {
    const L = clone(App.baseline.levers);
    for (const c of prop.changes) L[c.lever] = c.value;
    for (const l of prop.locks) { if (l.state === 'auto') delete L.locks[l.dc]; else L.locks[l.dc] = l.state; }
    if (prop.outage) { L.outage = { plantId: prop.outage.plantId, startWeek: prop.outage.startWeek, weeks: prop.outage.weeks }; L.reroute = prop.outage.reroute; }
    const name = (prop.interpretation || 'Copilot scenario').replace(/\.$/, '').slice(0, 60);
    App.draft = { name, levers: L, result: App.draft.result, sim: App.draft.sim, origin: 'copilot' };
    syncLevers(); await recomputeDraft();
    if (prop.sweep) {
      App.sweepCfg = { key: prop.sweep.lever, from: prop.sweep.from, to: prop.sweep.to, steps: prop.sweep.steps }; switchTab('sweep');
      await runSweep();
    } else if (prop.outage) switchTab('simulate');
    showResultCard(prop);
  }
  function summaryFor(res, sim) {
    const cr = (x) => +(x / 1e7).toFixed(2);
    return { annual_cost_cr: cr(res.total), components_cr: Object.fromEntries(COMP.map(([k, lab]) => [lab, cr(res.comp[k])])), dcs_in_use: res.open.map(j => App.data.dcs[j].name),
      inventory_cr: cr(res.kpi.inventoryValue), fill_rate_pct: +(sim.fillRate * 100).toFixed(2), trucks_per_week: +res.kpi.trucksPerWeek.toFixed(1),
      demand_within_one_day_pct: +(res.kpi.oneDayShare * 100).toFixed(1), co2_tonnes: Math.round(res.kpi.co2Tonnes), unserved_pct: +(res.kpi.unservedShare * 100).toFixed(2),
      outage: sim.outage ? { plant: plantName(sim.outage.plant), weeks: `${sim.outage.start + 1}-${sim.outage.end}`, rerouted_units: Math.round(sim.rerouted), extra_freight_cr: cr(sim.expediteCost) } : null };
  }
  function showResultCard(prop) {
    const b = App.baseline, d = App.draft;
    const card = el('div', { class: 'card' });
    card.append(el('div', { class: 'gate', text: 'Approval 2 of 2: keep this result?' }), el('h4', { text: 'Result against baseline' }));
    const kd = el('div', { class: 'kdelta' });
    const add = (lab, base, now, fmt, hib, dfmt) => { const dv = now - base; kd.append(el('span', { text: lab }), el('span', { class: 'muted', text: fmt(base) }), el('b', { style: { color: Math.abs(dv) < 1e-9 ? 'var(--ink)' : ((dv > 0) === hib ? 'var(--good)' : 'var(--bad)') }, text: fmt(now) + (Math.abs(dv) < 1e-9 ? '' : ` (${dfmt(dv)})`) })); };
    add('Annual cost', b.result.total, d.result.total, x => inr(x), false, signedInr);
    add('DCs in use', b.result.kpi.openDCs, d.result.kpi.openDCs, x => String(x), null, x => (x > 0 ? '+' : '−') + Math.abs(x));
    add('Fill rate', b.sim.fillRate, d.sim.fillRate, x => pct(x, 2), true, x => (x > 0 ? '+' : '−') + Math.abs(x * 100).toFixed(2) + ' pts');
    add('Inventory', b.result.kpi.inventoryValue, d.result.kpi.inventoryValue, x => inr(x), false, signedInr);
    if (d.sim.outage) add('Extra freight in outage', 0, d.sim.expediteCost, x => inr(x), false, signedInr);
    card.append(kd);
    if (App.sweep && prop.sweep) {
      const rows = App.sweep.rows; const tips = []; for (let i = 1; i < rows.length; i++) if (rows[i].open.join() !== rows[i - 1].open.join()) tips.push(rows[i]);
      card.append(el('div', { class: 'interp', text: tips.length ? `Sweep found ${tips.length} tipping point${tips.length > 1 ? 's' : ''}, first at ${LEVER[App.sweep.key].fmt(tips[0].value)}.` : 'Sweep found no tipping point: the design holds across the range.' }));
    }
    const exp = el('div', { class: 'msg ai' }); card.append(exp);
    const keep = el('button', { class: 'btn small primary', type: 'button', text: 'Make baseline' });
    const pinB = el('button', { class: 'btn small', type: 'button', text: 'Pin as scenario' });
    const discard = el('button', { class: 'btn small quiet', type: 'button', text: 'Discard' });
    card.append(el('div', { class: 'acts', style: { marginTop: '10px' } }, keep, pinB, discard));
    cpLog.append(card); cpLog.scrollTop = cpLog.scrollHeight;
    const done = (msg) => { [keep, pinB, discard].forEach(x => x.disabled = true); card.classList.add('done'); if (msg) addMsg('sys', msg); };
    keep.addEventListener('click', () => { promote(null); done('This scenario is now the baseline.'); });
    pinB.addEventListener('click', () => { pinDraft(); done('Pinned. The baseline is unchanged.'); });
    discard.addEventListener('click', () => { logAudit('You', 'Discarded the copilot scenario'); resetDraft(); done('Discarded. Back on the baseline.'); });
    explain(prop, exp);
  }
  async function explain(prop, target) {
    if (!App.sample) { target.textContent = 'Claude is not available in this view, so there is no written explanation. The numbers above come straight from the model.'; return; }
    const b = App.baseline, d = App.draft;
    const sweep = App.sweep && prop.sweep ? App.sweep.rows.map(r => ({ value: LEVER[App.sweep.key].fmt(r.value), cost_cr: +(r.total / 1e7).toFixed(2), dcs: r.open.map(id => dcName(id)) })) : null;
    const prompt = `You explain supply chain scenario results to a business owner in plain English. Use only the numbers given below; never invent or estimate a number that is not here. Money is in ₹ crore a year.

Scenario tested: ${prop.interpretation}
Baseline: ${JSON.stringify(summaryFor(b.result, b.sim))}
Scenario: ${JSON.stringify(summaryFor(d.result, d.sim))}
${sweep ? 'Sweep results: ' + JSON.stringify(sweep) : ''}

Write at most 150 words in 3 or 4 short paragraphs, plain text with no headings, bullets or markdown:
1. The headline: what happened to annual cost and service.
2. Why: the two or three cost components that moved most, and any change in which DCs are used.
3. The risk or trade-off to watch.
4. A recommendation, and one thing a human should check before adopting it.`;
    const ctl = new AbortController(); App.cpAbort = ctl; $('#cpStop').hidden = false; target.textContent = 'Thinking…';
    try {
      await App.sample(prompt, { signal: ctl.signal, modelTier: 'default', cache: false, onText: ({ text }) => { target.textContent = text; cpLog.scrollTop = cpLog.scrollHeight; } });
      logAudit('Copilot', 'Explained the result');
    } catch (e) {
      if (e && e.code === 'cancelled') target.textContent = e.text || 'Stopped.';
      else target.textContent = (e && e.text ? e.text + '\n\n' : '') + cpError(e);
    } finally { $('#cpStop').hidden = true; App.cpAbort = null; }
  }
  function cpError(e) {
    const c = e && e.code;
    if (c === 'not_granted' || c === 'sampling_disabled' || c === 'capability_disabled' || c === 'not_declared' || c === 'capability_removed') { App.sample = null; setCpStatus(); return 'Claude access is off for this page, so the copilot will stick to quick what-ifs.'; }
    if (c === 'rate_limited') return 'Claude is busy right now. Try again in a minute.';
    if (c === 'session_expired') return 'Your session expired. Sign in again to use the copilot.';
    if (c === 'invalid_json') return 'Claude replied in a shape the model could not read. Try rephrasing the question.';
    if (c === 'refused') return 'Claude declined that request. Try asking about costs, plants, DCs, demand or service.';
    return 'Something went wrong reaching Claude. Try again.';
  }
  async function askCopilot() {
    const ta = $('#cpInput'); const q = ta.value.trim(); if (!q) return; ta.value = '';
    addMsg('you', q); logAudit('You', `Asked: "${q.slice(0, 80)}"`);
    if (!App.sample) {
      const prop = ruleParse(q);
      if (prop) showProposal(validateProposal(prop), 'Rule-based parser');
      else addMsg('sys', 'Claude is not available in this view, so only simple requests work here, like "freight up 20%", "holding cost 35%", "close Kolkata" or "Pune down 3 weeks". The quick what-ifs below always work.');
      return;
    }
    const thinking = addMsg('sys', 'Reading your question…');
    const ctl = new AbortController(); App.cpAbort = ctl; $('#cpStop').hidden = false; $('#cpSend').disabled = true;
    try {
      const raw = await App.sample.json(proposalPrompt(q), { signal: ctl.signal, modelTier: 'default', cache: false });
      thinking.remove(); showProposal(validateProposal(raw), 'Copilot');
    } catch (e) { thinking.textContent = e && e.code === 'cancelled' ? 'Stopped.' : cpError(e); }
    finally { $('#cpStop').hidden = true; $('#cpSend').disabled = false; App.cpAbort = null; }
  }
  function ruleParse(q) {
    const s = q.toLowerCase(); const D = App.data; const prop = { interpretation: q, changes: [], locks: [], outage: null };
    const num = (re) => { const m = s.match(re); return m ? parseFloat(m[1]) : null; };
    let v;
    if (/(diesel|freight|fuel|transport)/.test(s) && (v = num(/(\d+(?:\.\d+)?)\s*%/)) != null) prop.changes.push({ lever: 'freightIndex', value: 1 + (/(down|fall|drop|cut|lower)/.test(s) ? -v : v) / 100 });
    if (/holding/.test(s) && (v = num(/(\d+(?:\.\d+)?)\s*%/)) != null) prop.changes.push({ lever: 'holdingRate', value: v / 100 });
    if (/demand/.test(s) && (v = num(/(\d+(?:\.\d+)?)\s*%/)) != null) prop.changes.push({ lever: 'demandGrowth', value: (/(down|fall|drop|lower|less)/.test(s) ? -v : v) / 100 });
    if (/service/.test(s) && (v = num(/(\d+(?:\.\d+)?)\s*%/)) != null) prop.changes.push({ lever: 'serviceLevel', value: v / 100 });
    if (/return/.test(s) && (v = num(/(\d+(?:\.\d+)?)\s*%/)) != null) prop.changes.push({ lever: 'returnIndex', value: 1 + v / 100 });
    for (const d of D.dcs) { const n = d.name.toLowerCase(); if (s.includes(n)) { if (/(close|shut|without|drop)/.test(s)) prop.locks.push({ dc: d.id, state: 'closed' }); else if (/(open|keep|add)/.test(s)) prop.locks.push({ dc: d.id, state: 'open' }); } }
    for (const p of D.plants) { const n = p.name.toLowerCase(); if (s.includes(n) && /(down|outage|shut|strike|stop|fire|flood)/.test(s)) { const w = num(/(\d+)\s*week/) || (/month/.test(s) ? 4 : 3); prop.outage = { plantId: p.id, startWeek: 19, weeks: w, reroute: !/(wait|no reroute)/.test(s) }; } }
    return prop.changes.length || prop.locks.length || prop.outage ? prop : null;
  }
  function setCpStatus() { $('#cpStatus').textContent = App.sample ? 'Claude is connected. Your first question asks your permission.' : 'Claude is not available here. Quick what-ifs still work.'; }

  /* ================= WELCOME ================= */
  const WELCOMED = 'tributary.welcomed.v1';
  const AUTHOR = { name: 'Dhiraj Badshe', url: 'https://www.linkedin.com/in/dhiraj-badshe-748326202/' };
  function seenWelcome() { try { return localStorage.getItem(WELCOMED) === '1'; } catch (e) { return false; } }
  function showWelcome() {
    if ($('.modal-back')) return;
    try { localStorage.setItem(WELCOMED, '1'); } catch (e) { /* storage unavailable: show again next visit */ }
    const back = el('div', { class: 'modal-back' });
    const close = () => { back.remove(); };
    const start = el('button', { class: 'btn primary', type: 'button', text: 'Start exploring', onclick: close });
    back.append(el('div', { class: 'modal welcome', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'welcomeTitle' },
      el('div', { class: 'kicker', text: 'A supply chain digital twin that runs in your browser' }),
      el('h2', { id: 'welcomeTitle', text: 'Tributary' }),
      el('p', { class: 'lead', text: 'Put in your plants, warehouses, customers, products and costs. Tributary forecasts demand, picks the cheapest set of distribution centres, sizes the stock each one holds, plans the trucks, costs returns and simulates a year of operations. Move any lever and the whole network re-plans.' }),
      el('h3', { text: 'Three things to try' }),
      el('ol', {},
        el('li', { html: 'Drag <b>Freight rates</b> up and watch whether the network opens another DC.' }),
        el('li', { html: 'Open <b>Simulate</b>, shut a plant for a month and see whether rerouting protects service.' }),
        el('li', { html: 'Open <b>Copilot</b> and tap a quick what-if such as <b>Diesel up 15%</b>. You approve every change before it runs.' })),
      el('p', { class: 'note', html: 'The demo network is synthetic, and its Indian road freight rates are assumptions. To model your own business, open <b>Your data</b>. All the maths runs in your browser, and anything you enter is saved only on this device. <b>How it works</b> explains every formula.' }),
      el('div', { class: 'actions' },
        el('span', { class: 'by' }, 'Built by ', el('a', { href: AUTHOR.url, target: '_blank', rel: 'noopener', text: AUTHOR.name })),
        el('button', { class: 'btn quiet', type: 'button', text: 'How it works', onclick: () => { close(); switchTab('method'); $('.bench').scrollIntoView({ block: 'start' }); } }),
        start)));
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.body.append(back); start.focus();
  }

  /* ================= INIT ================= */
  function setTopbarVar() { document.documentElement.style.setProperty('--tb', $('#topbar').offsetHeight + 'px'); }
  async function init() {
    readColors(); setTopbarVar();
    const saved = loadSaved();
    App.data = saved && saved.data ? saved.data : T.defaultData();
    setStatus('Forecasting 2 years of weekly demand…', true); await frame();
    try { App.fc = T.forecast(App.data); }
    catch (e) { console.error(e); App.data = T.defaultData(); App.fc = T.forecast(App.data); }
    const bl = normaliseLevers(saved && saved.baselineLevers);
    setStatus('Solving the baseline network…', true); await frame();
    const b = runScenario(bl); App.baseline = { levers: bl, result: b.res, sim: b.sim };
    if (saved && saved.draft && !sameLevers(normaliseLevers(saved.draft.levers), bl)) {
      const dl = normaliseLevers(saved.draft.levers); const d = runScenario(dl);
      App.draft = { name: saved.draft.name || 'Working draft', levers: dl, result: d.res, sim: d.sim, origin: saved.draft.origin || 'manual' };
    } else App.draft = { name: 'Baseline', levers: clone(bl), result: b.res, sim: b.sim, origin: 'baseline' };
    App.pinned = ((saved && saved.pinned) || []).map(p => ({ id: p.id, name: p.name, levers: normaliseLevers(p.levers), origin: p.origin }));
    App.audit = (saved && saved.audit) || [];
    renderLevers(); renderSummary(); renderTab(); renderAudit(); quickChips();
    MapView.resize(); MapView.setResult(App.draft.result, App.draft.levers, null); MapView.replayReveal();
    setStatus(`Costed ${n0(App.draft.result.search.evaluated)} network designs. Move a lever to re-plan.`);
    $$('#tabs button').forEach(bt => bt.addEventListener('click', () => switchTab(bt.dataset.tab)));
    $('#tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const bs = $$('#tabs button'); const i = bs.findIndex(x => x.dataset.tab === App.tab);
      const nx = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length]; nx.focus(); switchTab(nx.dataset.tab);
    });
    $('#btnPin').addEventListener('click', pinDraft);
    $('#btnBaseline').addEventListener('click', () => promote(null));
    $('#btnCopilot').addEventListener('click', () => openDrawer(!$('#drawer').classList.contains('open')));
    $('#btnAbout').addEventListener('click', showWelcome);
    $('#cpClose').addEventListener('click', () => openDrawer(false));
    $('#scrim').addEventListener('click', () => openDrawer(false));
    $('#cpSend').addEventListener('click', askCopilot);
    $('#cpStop').addEventListener('click', () => { if (App.cpAbort) App.cpAbort.abort(); });
    $('#cpInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askCopilot(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { openDrawer(false); const m = $('.modal-back'); if (m) m.remove(); } });
    addMsg('sys', 'Ask a what-if in plain English. I propose the change, you approve it, the model runs, and you decide whether to keep the result.');
    setCpStatus();
    const onTheme = () => { readColors(); MapView.kick(); if (['forecast', 'simulate', 'compare', 'sweep'].includes(App.tab)) renderTab(); };
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
    new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    let rt = null; window.addEventListener('resize', () => { setTopbarVar(); clearTimeout(rt); rt = setTimeout(() => { if (['forecast', 'simulate', 'compare', 'sweep'].includes(App.tab)) renderTab(); }, 200); });
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('sample').then(s => { App.sample = s || null; setCpStatus(); }).catch(() => { App.sample = null; setCpStatus(); });
      window.claude.use('downloads').then(d => { App.downloads = d || null; }).catch(() => { App.downloads = null; });
    } else setCpStatus();
    if (!seenWelcome()) showWelcome();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
