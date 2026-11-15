#!/bin/zsh
# Rebuilds mac-app/Theesees.icns from the drawing in make-icon.swift. Run it after changing the drawing,
# then run install.sh again. Needs Apple's command line tools.   ./mac-app/make-icon.sh
set -e
here="${0:A:h}"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
swift "$here/make-icon.swift" "$work/icon.png"
mkdir "$work/Theesees.iconset"
for size in 16 32 128 256 512; do
  sips -z $size $size "$work/icon.png" --out "$work/Theesees.iconset/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) "$work/icon.png" --out "$work/Theesees.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$work/Theesees.iconset" -o "$here/Theesees.icns"
echo "Wrote $here/Theesees.icns"
