#!/usr/bin/env python3
"""
AGL Portfolio — Local Server with API Proxy
-------------------------------------------
Serves static portfolio files AND proxies /api/ requests to the Open
Electricity API server-side (avoiding browser CORS restrictions).

Usage:
    python3 server.py
Then open:  http://localhost:8080
"""

import http.server
import urllib.request
import urllib.error
import os
import json

API_KEY  = 'oe_PRMyNcCKbmA1FM6U3uDYnZ'
OE_BASE  = 'https://api.openelectricity.org.au'
PORT     = 8080

class PortfolioHandler(http.server.SimpleHTTPRequestHandler):

    def do_GET(self):
        # Proxy anything under /api/ to the Open Electricity API
        if self.path.startswith('/api/'):
            self._proxy()
        else:
            super().do_GET()

    def _proxy(self):
        # /api/v4/market/... → https://api.openelectricity.org.au/v4/market/...
        upstream = OE_BASE + self.path[4:]   # strip '/api' prefix
        try:
            req = urllib.request.Request(
                upstream,
                headers={
                    'Authorization': f'Bearer {API_KEY}',
                    'Accept': 'application/json',
                    'User-Agent': 'AGL-Portfolio/1.0',
                }
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(body)
        except urllib.error.HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode())

    def log_message(self, fmt, *args):
        prefix = '  [proxy]' if (args and str(args[0]).startswith('/api/')) else '  [static]'
        print(f"{prefix} {fmt % args}")


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"\n  AGL Portfolio  →  http://localhost:{PORT}")
    print(f"  API proxy      →  /api/v4/... → {OE_BASE}/v4/...")
    print(f"  Press Ctrl+C to stop.\n")
    with http.server.HTTPServer(('', PORT), PortfolioHandler) as httpd:
        httpd.serve_forever()
