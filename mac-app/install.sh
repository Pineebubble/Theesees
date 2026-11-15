#!/bin/zsh
# Makes "Theesees.app": Theesees as a Mac app in its own window, no browser needed. It starts Theesees's
# local server (theesees-server.py) when needed. The app points at this copy of the project, so re-run this
# if you move the folder, and after changing anything in mac-app/.
#   ./mac-app/install.sh            # installs into /Applications (or ~/Applications)
#   ./mac-app/install.sh ~/Desktop  # or into a folder you name
# Needs Python 3, and Apple's command line tools for the window (xcode-select --install). Without those
# tools the icon opens Theesees in your browser instead.
set -e
here="${0:A:h}"; repo="${here:h}"
if [[ -n "$1" ]]; then dest="$1"; else dest=/Applications; [[ -w "$dest" ]] || dest="$HOME/Applications"; fi
mkdir -p "$dest"
python="$(command -v python3 || true)"
[[ -n "$python" ]] || { echo "Theesees needs Python 3 (https://www.python.org/downloads/)."; exit 1; }

# Build the window first, so a failed build leaves any installed app as it was.
build="$(mktemp -d)"; trap 'rm -rf "$build"' EXIT
if command -v swiftc >/dev/null && swiftc -O -swift-version 5 -o "$build/Theesees" "$here/Theesees.swift" 2>"$build/errors"; then
  native=yes
else
  native=no
  echo "Could not build the app window: $(grep -m1 . "$build/errors" 2>/dev/null || echo 'swiftc was not found')"
  echo "The icon will open Theesees in your browser instead."
fi

app="$dest/Theesees.app"
rm -rf "$app"; mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$here/Theesees.icns" "$here/start-server.sh" "$app/Contents/Resources/"
xml(){ print -r -- "${${${1//&/&amp;}//</&lt;}//>/&gt;}"; }
# The browser launcher has no window of its own, so it stays out of the Dock.
[[ $native == yes ]] && background="" || background="<key>LSUIElement</key><true/>"
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Theesees</string>
<key>CFBundleDisplayName</key><string>Theesees</string>
<key>CFBundleIdentifier</key><string>io.github.pineebubble.theesees</string>
<key>CFBundleExecutable</key><string>Theesees</string>
<key>CFBundleIconFile</key><string>Theesees</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
<key>TheeseesRepo</key><string>$(xml "$repo")</string>
<key>TheeseesPython</key><string>$(xml "$python")</string>
$background
</dict></plist>
PLIST

if [[ $native == yes ]]; then
  cp "$build/Theesees" "$app/Contents/MacOS/Theesees"
else
  # No compiler: a small script that starts the server and opens the default browser.
  cat > "$app/Contents/MacOS/Theesees" <<LAUNCH
#!/bin/zsh
repo=${(q)repo}
python=${(q)python}
LAUNCH
  cat >> "$app/Contents/MacOS/Theesees" <<'LAUNCH'
port="${THEESEES_PORT:-8765}"
if ! problem="$("${0:A:h}/../Resources/start-server.sh" "$repo" "$python" "$port")"; then
  osascript -e 'on run argv' -e 'display alert "Theesees could not start" message (item 1 of argv)' -e 'end run' "$problem" >/dev/null 2>&1
  exit 1
fi
[[ -n "$THEESEES_NO_BROWSER" ]] || open "http://127.0.0.1:$port/"
LAUNCH
  chmod +x "$app/Contents/MacOS/Theesees"
fi
codesign --force --sign - "$app" 2>/dev/null || true
touch "$app"
echo "Installed $app (for the copy of Theesees in $repo). Drag it to the Dock to keep it there."
