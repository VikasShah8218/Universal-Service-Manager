"""Exits with --code after --after seconds."""
import argparse, sys, time
ap = argparse.ArgumentParser()
ap.add_argument("--after", type=float, default=0.2)
ap.add_argument("--code", type=int, default=1)
a = ap.parse_args()
print(f"crasher: exiting with {a.code} in {a.after}s", flush=True)
time.sleep(a.after)
sys.exit(a.code)
