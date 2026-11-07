"""Writes lots of log output quickly."""
import time
for i in range(200000):
    print(f"line {i} " + "x" * 80)
print("flood done", flush=True)
while True:
    time.sleep(0.2)
