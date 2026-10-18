#!/usr/bin/env python3
"""Write dist/probe.html: the built page plus measurement hooks, for design audits only (never deploy it).
- Behaves like a first-time visitor without reading or changing stored data.
- ?stall=1 swaps in a worker that never answers, holding the page in its loading state for about 8 s.
- Loads axe-core (dev-only) and design/tools/inventory.js, which defines __inventory().
Usage: python3 build.py && python3 design/tools/make_probe.py [source page] [output name]
For the style tiles: python3 design/tools/make_probe.py design/tiles/index.html probe-tiles.html"""
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
src = sys.argv[1] if len(sys.argv) > 1 else "dist/tributary.html"
name = sys.argv[2] if len(sys.argv) > 2 else "probe.html"
page = (root / src).read_text(encoding="utf-8")
hooks = """<script>
(function () {
  const get = Storage.prototype.getItem;
  Storage.prototype.getItem = function (k) { return /^tributary\\./.test(k) ? null : get.call(this, k); };
  Storage.prototype.setItem = function () {};
  if (new URLSearchParams(location.search).get('stall')) window.Worker = class { postMessage() {} terminate() {} };
})();
</script>
<script src="https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js"></script>
<script>
""" + (root / "design" / "tools" / "inventory.js").read_text(encoding="utf-8") + "\n</script>\n"
# a full document gets the hooks after <body>; a page written for the artifact publisher has no <body>, so they go first
out = page.replace("<body>\n", "<body>\n" + hooks, 1) if "<body>\n" in page else page.replace("\n", "\n" + hooks, 1)
(root / "dist" / name).write_text(out, encoding="utf-8")
print("wrote dist/" + name)
