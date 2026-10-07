#!/bin/sh
# Publish the built page to GitHub Pages: https://2dextrous.github.io/tributary/
# The gh-pages branch holds only the site (index.html, og.png), rebuilt from the current commit each time.
set -e
cd "$(dirname "$0")"

npm test --silent
python3 build.py
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit your changes first, so the live site matches a commit." >&2
  exit 1
fi

site=$(mktemp -d)
trap 'rm -rf "$site"' EXIT
cp dist/tributary.html "$site/index.html"
cp assets/og.png "$site/og.png"
touch "$site/.nojekyll"

rev=$(git rev-parse --short HEAD)
git -C "$site" init -q -b gh-pages
git -C "$site" add -A
git -C "$site" -c user.name="$(git config user.name)" -c user.email="$(git config user.email)" commit -q -m "Deploy $rev"
git -C "$site" push -q -f "$(git remote get-url origin)" gh-pages
echo "Deployed $rev. GitHub Pages updates in a minute or two: https://2dextrous.github.io/tributary/"
