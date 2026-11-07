"""HTTP server with /health. --delay before listening; --stop-after makes the
server stop answering while the process stays alive (zombie app)."""
import argparse, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, required=True)
ap.add_argument("--delay", type=float, default=0)
ap.add_argument("--stop-after", type=float, default=0)
a = ap.parse_args()

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200 if self.path == "/health" else 404)
        self.end_headers()
        self.wfile.write(b"ok")
    def log_message(self, *args):
        pass

time.sleep(a.delay)
srv = ThreadingHTTPServer(("127.0.0.1", a.port), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
print(f"listening on {a.port}", flush=True)
try:
    if a.stop_after:
        time.sleep(a.stop_after)
        srv.shutdown(); srv.server_close()
        print("stopped answering", flush=True)
    while True:
        time.sleep(0.2)
except KeyboardInterrupt:
    print("graceful shutdown", flush=True)
