#!/usr/bin/env python3
"""Checks theesees-server.py: serves the app, stores and returns workspace files, keeps a daily version,
and refuses other websites, other addresses and paths outside the workspace, and relays only Zotero reads.   python3 server-check.py"""
import http.client, json, os, socket, subprocess, sys, tempfile, time

here = os.path.dirname(os.path.abspath(__file__))
with socket.socket() as s:
    s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]
store = tempfile.mkdtemp(prefix='theesees-check-')
srv = subprocess.Popen([sys.executable, os.path.join(here, 'theesees-server.py'), '--port', str(port), '--store', store], stdout=subprocess.DEVNULL,
                       env={**os.environ, 'THEESEES_ZOTERO': 'http://127.0.0.1:9/none'})

def call(method, path, body=None, **headers):
    c = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
    c.request(method, path, body, headers)
    r = c.getresponse(); data = r.read(); c.close()
    return r.status, data

try:
    for _ in range(50):
        try: call('GET', '/_store/'); break
        except OSError: time.sleep(0.1)
    W = {'X-Theesees-Store': '1'}
    assert call('GET', '/')[0] == 200 and b'Theesees' in call('GET', '/')[1]
    status, body = call('GET', '/_store/'); info = json.loads(body)
    assert status == 200 and info['theesees'] == 'store' and info['files'] == {}
    assert call('GET', '/_store/theesees-workspace.json')[0] == 404
    assert call('PUT', '/_store/theesees-workspace.json', b'{"v":1}', **W)[0] == 200
    assert call('PUT', '/_store/theesees-workspace.json', b'{"v":2}', **W)[0] == 200
    assert call('GET', '/_store/theesees-workspace.json')[1] == b'{"v":2}'
    kept = os.listdir(os.path.join(store, 'Versions'))
    assert len(kept) == 1 and open(os.path.join(store, 'Versions', kept[0]), 'rb').read() == b'{"v":1}'
    assert call('PUT', '/_store/PDFs/p1.pdf', b'x' * 3000, **W)[0] == 200
    assert call('PUT', '/_store/Conflicts/theesees-workspace%202026-11-14T10-00-00-000Z%20ab12.json', b'{}', **W)[0] == 200
    assert json.loads(call('GET', '/_store/')[1])['files'] == {'PDFs/p1.pdf': 3000}
    assert call('GET', '/_store/PDFs/p1.pdf')[1] == b'x' * 3000
    # Refused: no write header, another site, another address, paths outside the workspace, removing the record.
    assert call('PUT', '/_store/PDFs/p2.pdf', b'x')[0] == 403
    assert call('PUT', '/_store/PDFs/p2.pdf', b'x', Origin='https://example.com', **W)[0] == 403
    assert call('GET', '/_store/', **{'Sec-Fetch-Site': 'cross-site'})[0] == 403
    assert call('GET', '/_store/', Host='example.com')[0] == 403 and call('GET', '/', Host='example.com')[0] == 403
    for bad in ('/_store/PDFs/..%2F..%2Fx', '/_store/../x', '/_store/notes.txt', '/_store/PDFs/.hidden', '/_store/Versions/x.json'):
        assert call('PUT', bad, b'x', **W)[0] in (400, 405), bad
    assert call('DELETE', '/_store/theesees-workspace.json', **W)[0] == 400
    assert call('DELETE', '/_store/PDFs/p1.pdf', **W)[0] == 200 and call('GET', '/_store/PDFs/p1.pdf')[0] == 404
    # Zotero relay: only the two requests the app makes; here Zotero is "not running" (nothing on that port).
    assert call('GET', '/_zotero/items')[0] == 502 and json.loads(call('GET', '/_zotero/items')[1])['error'] == 'not-running'
    for bad in ('/_zotero/items?itemKey=../x', '/_zotero/items?start=x', '/_zotero/collections', '/_zotero/items/ABCD1234/file'):
        assert call('GET', bad)[0] == 400, bad
    assert call('GET', '/_zotero/items', **{'Sec-Fetch-Site': 'cross-site'})[0] == 403
    assert not [n for d, _, f in os.walk(store) for n in f if n.startswith('.saving-')]
    print('PASS: local server (serves the app, stores workspace files, daily version, refuses other sites and paths)')
finally:
    srv.terminate()
