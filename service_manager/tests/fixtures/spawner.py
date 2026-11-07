"""Spawns a grandchild (sleeper) and writes its pid to --pidfile, then sleeps.
Simulates npm -> node -> vite trees."""
import argparse, os, subprocess, sys, time
ap = argparse.ArgumentParser()
ap.add_argument("--pidfile", required=True)
ap.add_argument("--exit-parent", action="store_true", help="parent exits, orphaning the grandchild")
a = ap.parse_args()
child = subprocess.Popen([sys.executable, os.path.join(os.path.dirname(__file__), "sleeper.py")])
with open(a.pidfile, "w") as f:
    f.write(str(child.pid))
print(f"spawned grandchild {child.pid}", flush=True)
if a.exit_parent:
    time.sleep(0.5)
    sys.exit(3)
try:
    while True:
        time.sleep(0.2)
except KeyboardInterrupt:
    sys.exit(0)
