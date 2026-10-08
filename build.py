#!/usr/bin/env python3
"""Assemble src/ into one self-contained, publishable page: dist/tributary.html"""
from pathlib import Path

root = Path(__file__).resolve().parent
src = root / "src"
read = lambda name: (src / name).read_text(encoding="utf-8")
html = (
    read("head.html")
    + "<style>\n" + read("styles.css") + "\n</style>\n</head>\n<body>\n"
    + read("body.html")
    # app.js reads the engine and host scripts back by id to start the engine in a Web Worker
    + '\n<script id="trib-engine">\n' + read("engine.js") + "\n</script>\n"
    + '<script id="trib-host">\n' + read("worker.js") + "\n</script>\n"
    + "<script>\n" + read("app.js") + "\n</script>\n</body>\n</html>\n"
)
out = root / "dist" / "tributary.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding="utf-8")
print(f"built {out.relative_to(root)} ({len(html) // 1024} KB)")
