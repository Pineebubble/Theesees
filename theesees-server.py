#!/usr/bin/env python3
"""Theesees on this computer: serves the app (dist/) and keeps the workspace in a folder, so every browser
on this computer opens the same work.

    python3 theesees-server.py            # then open http://127.0.0.1:8765/

The folder (default: ~/Documents/Theesees Workspace) has the same layout as a sync folder:
theesees-workspace.json, PDFs/, Pictures/, Conflicts/. The app reads and writes it through /_store/.
One copy of the workspace file per day is kept in Versions/. Only this computer can connect, and only
pages served from here can read or change the folder. Needs Python 3.8+, nothing else.

It also relays the app's "Sync from Zotero": /_zotero/items reads highlights and their papers from Zotero
running on this computer (Zotero's Settings → Advanced → "Allow other applications on this computer to
communicate with Zotero"). A web page cannot ask Zotero directly, so the request goes through here. It only
reads, and only Zotero's own library on this computer.
"""
import argparse, json, os, re, shutil, sys, tempfile, time
import urllib.error, urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlencode, urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
PREFIX = '/_store/'
RECORD = 'theesees-workspace.json'
# Only the files the app itself makes: ids are letters, digits, "_", "." and "-" (see syncSafeId in sync-core.js).
ALLOWED = re.compile(r'(theesees-workspace\.json|(PDFs|Pictures)/[\w.-]+|Conflicts/[\w .-]+\.json)\Z', re.ASCII)
MAX_BYTES = 2 * 1024 ** 3
ZOTERO_PREFIX = '/_zotero/'
ZOTERO_ITEMS = os.environ.get('THEESEES_ZOTERO') or 'http://127.0.0.1:23119/api/users/0/items'
ZOTERO_KEYS = re.compile(r'[A-Z0-9]{8}(,[A-Z0-9]{8}){0,49}\Z')
ZOTERO = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # this computer only: never through a proxy
KEEP_VERSIONS = 30


class Handler(SimpleHTTPRequestHandler):
    store = None
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        if self.server.verbose:
            super().log_message(fmt, *args)

    def end_headers(self):
        # The app's files change when Theesees is updated; let the browser check instead of guessing.
        if not self.path.startswith((PREFIX, ZOTERO_PREFIX)):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    # --- Who is asking ---
    def local_names(self):
        port = self.server.server_address[1]
        return {f'127.0.0.1:{port}', f'localhost:{port}'}

    def trusted(self, writing):
        """Other websites must not reach the folder: the address must be this computer's (blocks DNS
        rebinding), the request must come from a page served here, and writes need a header that a
        cross-site page cannot send without permission we never give."""
        if self.headers.get('Host') not in self.local_names():
            return False
        if self.headers.get('Sec-Fetch-Site', 'same-origin') not in ('same-origin', 'none'):
            return False
        origin = self.headers.get('Origin')
        if origin and origin not in {'http://' + n for n in self.local_names()}:
            return False
        return not writing or self.headers.get('X-Theesees-Store') == '1'

    def store_path(self):
        """The file in the folder this request names, or None if it is not one the app may touch."""
        rel = unquote(urlsplit(self.path).path[len(PREFIX):])
        if not ALLOWED.match(rel) or any(p.startswith('.') for p in rel.split('/')):
            return None
        return os.path.join(self.store, *rel.split('/'))

    def reply(self, code, body=b'', ctype='application/json'):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def refuse(self, code, why):
        self.close_connection = True  # an unread upload may still be on the line
        self.reply(code, {'error': why})

    # --- Zotero on this computer (read only) ---
    def zotero(self):
        """/_zotero/items?start=N lists annotations, 100 at a time; with itemKey=A,B,… it returns those items.
        Replies {total, items}, or an error the app turns into advice: not-running, not-enabled, zotero."""
        url = urlsplit(self.path)
        asked = parse_qs(url.query)
        start, keys = asked.get('start', ['0'])[0], asked.get('itemKey', [''])[0]
        if url.path != ZOTERO_PREFIX + 'items' or not start.isdigit() or (keys and not ZOTERO_KEYS.match(keys)):
            return self.refuse(400, 'Not a Zotero request Theesees makes.')
        query = {'format': 'json', 'limit': '100', 'start': start}
        query.update({'itemKey': keys} if keys else {'itemType': 'annotation'})
        try:
            with ZOTERO.open(ZOTERO_ITEMS + '?' + urlencode(query), timeout=30) as r:
                items, total = json.load(r), int(r.headers.get('Total-Results') or 0)
        except urllib.error.HTTPError as e:
            return self.reply(502, {'error': 'not-enabled' if e.code == 403 else 'zotero', 'status': e.code})
        except (OSError, ValueError):
            return self.reply(502, {'error': 'not-running'})
        self.reply(200, {'total': max(total, len(items)), 'items': items})

    # --- The folder ---
    def do_GET(self):
        if self.path.startswith(ZOTERO_PREFIX):
            return self.zotero() if self.trusted(False) else self.refuse(403, 'Not allowed.')
        if not self.path.startswith(PREFIX):
            if self.headers.get('Host') not in self.local_names():
                return self.refuse(403, 'Open Theesees at http://127.0.0.1:%d/' % self.server.server_address[1])
            return super().do_GET()
        if not self.trusted(False):
            return self.refuse(403, 'Not allowed.')
        if urlsplit(self.path).path == PREFIX:
            files = {}
            for sub in ('PDFs', 'Pictures'):
                d = os.path.join(self.store, sub)
                if os.path.isdir(d):
                    for e in os.scandir(d):
                        if e.is_file() and not e.name.startswith('.'):
                            files[f'{sub}/{e.name}'] = e.stat().st_size
            home = os.path.expanduser('~')
            shown = '~' + self.store[len(home):] if self.store.startswith(home + os.sep) else self.store
            return self.reply(200, {'theesees': 'store', 'version': 1, 'name': os.path.basename(self.store), 'path': shown, 'files': files})
        path = self.store_path()
        if not path:
            return self.refuse(400, 'Not a workspace file.')
        try:
            f = open(path, 'rb')
        except FileNotFoundError:
            return self.reply(404, {'error': 'No such file.'})
        with f:
            size = os.fstat(f.fileno()).st_size
            self.send_response(200)
            self.send_header('Content-Type', 'application/json' if path.endswith('.json') else 'application/octet-stream')
            self.send_header('Content-Length', str(size))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            shutil.copyfileobj(f, self.wfile)

    def do_PUT(self):
        if not self.path.startswith(PREFIX):
            return self.refuse(405, 'Not allowed.')
        if not self.trusted(True):
            return self.refuse(403, 'Not allowed.')
        path = self.store_path()
        if not path:
            return self.refuse(400, 'Not a workspace file.')
        try:
            left = int(self.headers.get('Content-Length', ''))
        except ValueError:
            return self.refuse(411, 'Missing length.')
        if left > MAX_BYTES:
            return self.refuse(413, 'Too large.')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        # Write beside the file, then swap it in, so a crash never leaves half a file.
        fd, tmp = tempfile.mkstemp(prefix='.saving-', dir=os.path.dirname(path))
        try:
            with os.fdopen(fd, 'wb') as out:
                while left:
                    chunk = self.rfile.read(min(left, 1 << 20))
                    if not chunk:
                        raise ConnectionError('Upload stopped early.')
                    out.write(chunk)
                    left -= len(chunk)
                out.flush()
                os.fsync(out.fileno())
            if os.path.basename(path) == RECORD:
                self.keep_version(path)
            os.replace(tmp, path)
        except Exception as e:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            return self.refuse(500, str(e))
        self.reply(200, {'ok': True})

    def do_DELETE(self):
        if not self.path.startswith(PREFIX):
            return self.refuse(405, 'Not allowed.')
        if not self.trusted(True):
            return self.refuse(403, 'Not allowed.')
        path = self.store_path()
        if not path or os.path.basename(path) == RECORD:
            return self.refuse(400, 'Not a removable workspace file.')
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
        self.reply(200, {'ok': True})

    def keep_version(self, path):
        """Before the first save of each day, keep yesterday's workspace file in Versions/."""
        if not os.path.exists(path):
            return
        folder = os.path.join(self.store, 'Versions')
        copy = os.path.join(folder, f'theesees-workspace {time.strftime("%Y-%m-%d")}.json')
        if os.path.exists(copy):
            return
        os.makedirs(folder, exist_ok=True)
        shutil.copy2(path, copy)
        old = sorted(n for n in os.listdir(folder) if n.startswith('theesees-workspace ') and n.endswith('.json'))
        for n in old[:-KEEP_VERSIONS]:
            os.unlink(os.path.join(folder, n))


def main():
    ap = argparse.ArgumentParser(description='Serve Theesees and keep its workspace in a folder on this computer.')
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--store', default=os.environ.get('THEESEES_STORE') or os.path.join(os.path.expanduser('~'), 'Documents', 'Theesees Workspace'),
                    help='folder that holds the workspace (default: ~/Documents/Theesees Workspace)')
    ap.add_argument('--dist', default=os.path.join(HERE, 'dist'), help=argparse.SUPPRESS)
    ap.add_argument('--verbose', action='store_true', help='print each request')
    a = ap.parse_args()
    store = os.path.abspath(os.path.expanduser(a.store))
    os.makedirs(store, exist_ok=True)
    Handler.store = store
    try:
        srv = ThreadingHTTPServer(('127.0.0.1', a.port), partial(Handler, directory=a.dist))
    except OSError as e:
        sys.exit(f'Could not start on port {a.port}: {e}. Is Theesees already running?')
    srv.daemon_threads = True
    srv.verbose = a.verbose
    print(f'Theesees is at http://127.0.0.1:{a.port}/  (workspace folder: {store})', flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
