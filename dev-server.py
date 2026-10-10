#!/usr/bin/env python3
"""Local development server for Prisjagt. NOT for production.

Serves the static site and forwards /api/* to api.sallinggroup.com, adding the
CORS headers the browser needs. Salling Group only sends
Access-Control-Allow-Origin on successful responses for origins registered on
your API key, so this proxy lets you work locally before that is set up.

The deployed site talks to the API directly and needs no proxy - register your
production origin on the key instead.

    python3 dev-server.py [port]     # default 8000
"""

import io
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = 'https://api.sallinggroup.com'
PREFIX = '/api/'
# retry-after matters: the app clamps it to decide the cooldown, so local
# testing must see the same header production would.
PASS_THROUGH = ('content-type', 'x-trace-id', 'retry-after')


class DevHandler(SimpleHTTPRequestHandler):
    def _cors(self):
        origin = self.headers.get('Origin', '*')
        self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Headers', 'Authorization,Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET,OPTIONS')

    def do_OPTIONS(self):
        if not self.path.startswith(PREFIX):
            return SimpleHTTPRequestHandler.do_OPTIONS(self)
        self.send_response(204)
        self._cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _serve_index(self):
        """Serve index.html with the API base pointed at this proxy.

        Injected rather than committed so index.html stays production-clean.
        """
        try:
            page = io.open('index.html', encoding='utf-8').read()
        except OSError:
            self.send_error(404, 'index.html not found')
            return
        tag = '<script src="app.js"></script>'
        inject = "<script>window.PRISJAGT_API = '/api';</script>\n" + tag
        if tag not in page:
            self.send_error(500, 'index.html does not load app.js as expected')
            return
        body = page.replace(tag, inject).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            return self._serve_index()
        if not self.path.startswith(PREFIX):
            return SimpleHTTPRequestHandler.do_GET(self)

        url = UPSTREAM + self.path[len(PREFIX) - 1:]
        req = urllib.request.Request(url)
        auth = self.headers.get('Authorization')
        if auth:
            req.add_header('Authorization', auth)

        try:
            with urllib.request.urlopen(req, timeout=30) as upstream:
                status, headers, body = upstream.status, upstream.headers, upstream.read()
        except urllib.error.HTTPError as err:
            status, headers, body = err.code, err.headers, err.read()
        except Exception as err:                      # network failure, DNS, timeout
            body = ('{"errorMessage":"dev proxy could not reach the API: %s",'
                    '"statusCode":502}' % err).encode()
            self.send_response(502)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self.send_response(status)
        self._cors()
        for name in PASS_THROUGH:
            if headers.get(name):
                self.send_header(name, headers[name])
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print('Prisjagt dev server on http://localhost:%d  (API proxied at %s)' % (port, PREFIX))
    ThreadingHTTPServer(('127.0.0.1', port), DevHandler).serve_forever()
