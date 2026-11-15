#!/bin/zsh
# Makes sure Theesees's local server is running. Used by Theesees.app (it is copied inside by install.sh).
#   start-server.sh <project folder> <python3> [port]
# Exits 0 once the server answers. Otherwise prints what went wrong, for the app to show, and exits 1.
# The server is left running after the app closes, so browsers on this Mac keep working.
repo="$1"; python="$2"; port="${3:-8765}"
url="http://127.0.0.1:$port/"; log="$HOME/Library/Logs/Theesees.log"
# Theesees's own server, not some other program on the port.
running(){ curl -s -m 2 "${url}_store/" 2>/dev/null | grep -q '"theesees": "store"'; }
running && exit 0
if [[ ! -f "$repo/theesees-server.py" ]]; then
  echo "Its folder is no longer at $repo. Run mac-app/install.sh again from where the folder is now."; exit 1
fi
# An older, plain server for the same folder (python3 -m http.server) may hold the address: replace it.
for pid in $(lsof -nP -t -iTCP:$port -sTCP:LISTEN 2>/dev/null); do
  ps -o command= -p $pid | grep -q "http\.server $port" && kill $pid && sleep 0.5
done
[[ -x "$python" ]] || python="$(PATH="/Library/Frameworks/Python.framework/Versions/Current/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" command -v python3)"
if [[ -z "$python" ]]; then echo "Python 3 was not found. Install it from https://www.python.org/downloads/ and open Theesees again."; exit 1; fi
nohup "$python" "$repo/theesees-server.py" --port "$port" >> "$log" 2>&1 &!
for i in {1..40}; do running && exit 0; sleep 0.25; done
echo "See $log for the reason. If something else is using port $port, close it and try again."; exit 1
