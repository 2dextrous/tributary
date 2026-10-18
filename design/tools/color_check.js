// Colour checks the DOM audit cannot see: text drawn on the canvas map and charts, and colour-blind separation.
// Run: node design/tools/color_check.js   (reads the light and dark tokens from src/styles.css)
// Contrast is WCAG 2 relative luminance. Colour blindness uses the Machado, Oliveira and Fernandes (2009) matrices at
// full severity in linear RGB. Separation is the distance in OKLab x 100; under 10 two colours are hard to tell apart.
const fs = require('fs');
const path = require('path');

const toRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const lum = (h) => { const [r, g, b] = toRgb(h).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const CVD = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039]
};
function oklab(lin) {
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function seen(hex, type) {
  const v = toRgb(hex).map(toLin);
  if (!type) return v;
  const M = CVD[type];
  return [0, 3, 6].map(i => Math.min(1, Math.max(0, M[i] * v[0] + M[i + 1] * v[1] + M[i + 2] * v[2])));
}
const sep = (a, b, type) => { const p = oklab(seen(a, type)), q = oklab(seen(b, type)); return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
// smallest separation of any pair in a palette, for normal vision and each kind of colour blindness
function worstPair(colors) {
  const out = {};
  for (const type of [null, 'protan', 'deutan', 'tritan']) {
    let worst = { d: Infinity };
    const names = Object.keys(colors);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const d = sep(colors[names[i]], colors[names[j]], type);
      if (d < worst.d) worst = { d, pair: names[i] + '/' + names[j] };
    }
    out[type || 'normal'] = `${worst.d.toFixed(1)} (${worst.pair})`;
  }
  return out;
}
module.exports = { contrast, sep, worstPair };

if (require.main === module) {
  const css = fs.readFileSync(path.join(__dirname, '../../src/styles.css'), 'utf8');
  const block = (re) => Object.fromEntries([...css.match(re)[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})/g)].map(m => [m[1], m[2]]));
  const light = block(/:root \{([^}]*)\}/), dark = Object.assign({}, light, block(/:root\[data-theme="dark"\] \{([^}]*)\}/));
  // text the app draws on its canvases (src/app.js): what, colour, background, size in px, weight
  const canvasText = [
    ['map grid labels', 'ink-3', 'map-bg', 10.5, 500], ['map DC candidate labels', 'ink-3', 'map-bg', 11, 500],
    ['map open DC labels', 'ink', 'map-bg', 12.5, 700], ['map plant labels', 'plant', 'map-bg', 12.5, 700],
    ['map returns hub label', 'amber', 'map-bg', 11.5, 700], ['chart axis labels', 'ink-3', 'bg-elev', 11.5, 500],
    ['chart line labels', 'ink-2', 'bg-elev', 11, 600], ['waterfall values', 'ink', 'bg-elev', 11, 600]
  ];
  for (const [name, T] of [['light', light], ['dark', dark]]) {
    console.log(`\n${name}: canvas text (needs 4.5:1, or 3:1 at 24px+ / 18.7px bold)`);
    for (const [what, fg, bg, px, w] of canvasText) {
      const c = contrast(T[fg], T[bg]), need = px >= 24 || (px >= 18.66 && w >= 700) ? 3 : 4.5;
      console.log(`  ${c >= need ? 'pass' : 'FAIL'} ${c.toFixed(2)}:1  ${what} (${fg} on ${bg}, ${px}px)`);
    }
    console.log(`${name}: good/bad deltas, separation by vision type:`, JSON.stringify(worstPair({ good: T.good, bad: T.bad })));
    console.log(`${name}: map colours (plant, DC and flows, demand points, returns):`, JSON.stringify(worstPair({ plant: T.plant, dc: T.flow, demand: T.ink, returns: T.amber })));
  }
}
