#!/bin/bash
# Publishes dist/ to the gh-pages branch, which GitHub Pages serves at
# https://pineebubble.github.io/Theesees/. Run after pushing main.
set -e
cd "$(dirname "$0")"
for f in *-check.cjs; do node "$f" >/dev/null || { echo "Check failed: $f"; exit 1; }; done
git diff --quiet HEAD -- dist || { echo "dist has uncommitted changes; commit them first."; exit 1; }
git push origin "$(git subtree split --prefix dist HEAD)":refs/heads/gh-pages --force
echo "Published. The site updates within a minute or two."
