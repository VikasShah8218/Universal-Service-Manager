"""Long-running service. Prints 'ready', optionally listens on --port.
Exits 0 and prints 'graceful shutdown' on Ctrl+C / SIGTERM.
--ignore-signals: refuses to stop gracefully (to test the kill fallback)."""
import argparse, signal, socket, sys, time

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int)
ap.add_argument("--ignore-signals", action="store_true")
ap.add_argument("--delay", type=float, default=0)
a = ap.parse_args()

def graceful(*_):
    print("graceful shutdown", flush=True)
    sys.exit(0)

if a.ignore_signals:
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
else:
    signal.signal(signal.SIGTERM, graceful)

time.sleep(a.delay)
srv = None
if a.port:
    srv = socket.socket()
    srv.bind(("127.0.0.1", a.port))
    srv.listen()
print("ready", flush=True)
try:
    while True:
        time.sleep(0.2)
except KeyboardInterrupt:
    graceful()
