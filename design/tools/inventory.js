// Phase 1 inventory: text size, contrast, touch targets and axe findings for each state of the page.
// make_probe.py injects this into a probe copy of the built page; run it with `await __inventory(['welcome', ...])`.
(function () {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const rgb = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const mix = (t, u, a) => ({ r: t.r * a + u.r * (1 - a), g: t.g * a + u.g * (1 - a), b: t.b * a + u.b * (1 - a), a: 1 });
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  // what actually sits behind an element: its own and its ancestors' backgrounds, composited
  function behind(el) {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = mix(layers[i], base, layers[i].a);
    return base;
  }
  const opacity = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
  const shown = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width >= 2 && r.height >= 2 && cs.visibility !== 'hidden' && el.getClientRects().length > 0; };
  const FIELD = 'select, textarea, input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file])';
  const TARGET = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=tab], [role=button]';
  const kind = (el) => el.tagName.toLowerCase() + (el.type && el.tagName === 'INPUT' ? '[' + el.type + ']' : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + (el.parentElement && el.parentElement.className ? ' in .' + String(el.parentElement.className).split(/\s+/)[0] : '');

  function measure(root, name, acc) {
    const els = [...(root === document ? document.body : root).querySelectorAll('*')].filter(el => !el.closest('script, style, [inert], .sr-only') && shown(el));
    let nText = 0, minPx = 99, under12 = 0, under14 = 0, fails = 0, t24 = 0, t44 = 0;
    for (const el of els) {
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || (el.matches(FIELD) && (el.value || el.textContent).trim());
      if (own && !el.closest(':disabled')) {
        const cs = getComputedStyle(el), px = parseFloat(cs.fontSize), w = +cs.fontWeight;
        const bg = behind(el), fg = mix(rgb(cs.color), bg, rgb(cs.color).a * opacity(el)), cr = ratio(fg, bg);
        const large = px >= 24 || (px >= 18.66 && w >= 700), need = large ? 3 : 4.5;
        nText++; minPx = Math.min(minPx, px); if (px < 12) under12++; if (px < 14) under14++;
        const fam = cs.fontFamily.split(',')[0].replace(/"/g, '');
        acc.sizes[px] = (acc.sizes[px] || 0) + 1; acc.fams[fam] = (acc.fams[fam] || 0) + 1;
        if (cr < need) {
          fails++;
          const key = `${hex(fg)} on ${hex(bg)} ${cr.toFixed(2)}:1 @${px}px`;
          const f = acc.fails[key] || (acc.fails[key] = { n: 0, states: new Set(), eg: el.textContent.trim().slice(0, 32) });
          f.n++; f.states.add(name);
        }
      }
      if (el.matches(TARGET) && !el.disabled) {
        const r = el.getBoundingClientRect(), side = Math.min(r.width, r.height);
        if (side < 24) t24++; if (side < 44) t44++;
        const k = kind(el), t = acc.targets[k] || (acc.targets[k] = { n: 0, h: 999, w: 999 });
        t.n++; t.h = Math.min(t.h, Math.round(r.height)); t.w = Math.min(t.w, Math.round(r.width));
      }
    }
    acc.states.push([name, nText, minPx === 99 ? null : minPx, under12, under14, fails, t24, t44, document.documentElement.scrollWidth > innerWidth]);
  }
  async function axeRun(ctx, name, acc) {
    if (!window.axe) return;
    const res = await axe.run(ctx, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    for (const v of res.violations) { const a = acc.axe[v.id] || (acc.axe[v.id] = { impact: v.impact, nodes: 0, states: new Set() }); a.nodes += v.nodes.length; a.states.add(name); }
  }
  const STATES = {
    async welcome(acc) { $('#btnAbout').click(); await sleep(200); measure($('.modal-back'), 'welcome', acc); await axeRun('.modal-back', 'welcome', acc); $('.modal-back').remove(); },
    async copilot(acc) { $('#btnCopilot').click(); await sleep(450); measure($('#drawer'), 'copilot', acc); await axeRun('#drawer', 'copilot', acc); $('#cpClose').click(); await sleep(400); },
    async loading(acc) { measure(document, 'loading', acc); await axeRun(document, 'loading', acc); },
    async error(acc) {
      // lock every DC closed, so no network is possible
      $('[data-tab="network"]').click(); await sleep(300);
      const names = [...document.querySelectorAll('#tabpanel [aria-label^="Control for "]')].map(g => g.getAttribute('aria-label'));
      for (const n of names) { $(`[aria-label="${n}"] button:nth-child(3)`).click(); await sleep(120); }
      await sleep(1500);
      const s = $('#status');
      acc.error = { text: s.textContent, shownOnScreen: getComputedStyle(s).display !== 'none', pill: !$('#busy').hidden };
      measure($('#topbar'), 'error', acc);
      $('.lever-actions button').click(); await sleep(600);
    }
  };
  window.__inventory = async function (names) {
    const acc = { states: [], fails: {}, targets: {}, axe: {}, sizes: {}, fams: {} };
    for (const n of names) {
      if (typeof n === 'object') { await n.setup(); await sleep(400); measure(document, n.name, acc); await axeRun(document, n.name, acc); }
      else if (STATES[n]) await STATES[n](acc);
      else { $(`[data-tab="${n}"]`).click(); await sleep(350); measure(document, n, acc); await axeRun(document, n, acc); }
    }
    return {
      view: `${innerWidth}px ${matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'}`,
      cols: 'state, texts, min px, <12px, <14px, contrast fails, targets <24, targets <44, h-scroll',
      states: acc.states, error: acc.error,
      fails: Object.entries(acc.fails).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [k, v.n, [...v.states].length, v.eg]),
      targets: Object.entries(acc.targets).filter(([, v]) => v.h < 44 || v.w < 44).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [k, v.n, `${v.w}x${v.h}`]),
      axe: Object.entries(acc.axe).map(([k, v]) => [k, v.impact, v.nodes, [...v.states].length]),
      sizes: acc.sizes, fonts: acc.fams
    };
  };
})();
