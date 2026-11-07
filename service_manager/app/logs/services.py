"""Service logs.

Children write straight into `output.log` (append-only handle), so they never
block on a slow reader and keep logging even while the manager is down.
The manager *tails* that file into an in-memory ring buffer (for the API/UI)
and rotates it with copy-truncate.
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from app.projects.schemas import LogPolicy

log = logging.getLogger(__name__)

POLL_INTERVAL_S = 0.2
PARTIAL_FLUSH_S = 0.5  # emit an unterminated line (e.g. a prompt) after this long
PRELOAD_BYTES = 64 * 1024
MAX_READ = 1024 * 1024
MAX_PER_TICK = 8 * 1024 * 1024  # ~40 MB/s of log throughput per service


@dataclass(frozen=True)
class LogLine:
    seq: int
    ts: float
    text: str


class LogBuffer:
    def __init__(self, maxlen: int):
        self._lines: deque[LogLine] = deque(maxlen=maxlen)
        self._seq = 0
        self.on_line: Callable[[str], None] | None = None
        self._subscribers: set[asyncio.Queue] = set()

    @property
    def last_seq(self) -> int:
        return self._seq

    def append(self, text: str, ts: float | None = None, notify: bool = True) -> None:
        self._seq += 1
        line = LogLine(self._seq, ts or time.time(), text)
        self._lines.append(line)
        if not notify:
            return
        if self.on_line is not None:
            try:
                self.on_line(text)
            except Exception:  # a listener must never break log capture
                log.exception("log listener failed")
        for q in list(self._subscribers):
            try:
                q.put_nowait(line)
            except asyncio.QueueFull:
                pass  # slow consumer drops lines; the child is never blocked

    def tail(self, n: int) -> list[LogLine]:
        if n <= 0:
            return []
        return list(self._lines)[-n:]

    def since(self, seq: int, limit: int = 1000) -> list[LogLine]:
        return [ln for ln in self._lines if ln.seq > seq][:limit]

    def subscribe(self, maxsize: int = 5000) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)


def _decode(data: bytes) -> str:
    return data.decode("utf-8", errors="replace").rstrip("\r")


def rotate(path: Path, max_files: int, offset: int) -> bytes:
    """copy-truncate: output.log -> output.log.1 -> ... ; then truncate output.log.

    Returns the bytes after `offset` that the tailer has not consumed yet, read
    right before truncation, so the live view loses (almost) nothing. Writes
    landing between that final read and the truncate (microseconds) end up
    only in output.log.1.
    """
    if max_files > 1:
        for i in range(max_files - 1, 0, -1):
            src = path.with_name(f"{path.name}.{i}")
            if src.exists():
                if i == max_files - 1:
                    src.unlink(missing_ok=True)
                else:
                    os.replace(src, path.with_name(f"{path.name}.{i + 1}"))
        shutil.copyfile(path, path.with_name(f"{path.name}.1"))
    with open(path, "rb") as f:
        f.seek(offset)
        rest = f.read()
    os.truncate(path, 0)
    return rest


class LogTailer:
    def __init__(self, path: Path, buffer: LogBuffer, policy: Callable[[], LogPolicy]):
        self.path = path
        self.buffer = buffer
        self._policy = policy
        self._offset = 0
        self._partial = b""
        self._partial_since = 0.0

    def preload(self) -> None:
        """Show recent history after a manager restart, without re-triggering listeners."""
        try:
            size = self.path.stat().st_size
        except FileNotFoundError:
            self._offset = 0
            return
        start = max(0, size - PRELOAD_BYTES)
        with open(self.path, "rb") as f:
            f.seek(start)
            data = f.read(size - start)
        lines = data.split(b"\n")
        if start > 0:
            lines = lines[1:]  # first one is probably cut
        if lines and lines[-1] == b"":
            lines = lines[:-1]
        for raw in lines:
            self.buffer.append(_decode(raw), notify=False)
        self._offset = size

    async def run(self) -> None:
        while True:
            try:
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("log tailer error for %s", self.path)
            await asyncio.sleep(POLL_INTERVAL_S)

    async def _tick(self) -> None:
        try:
            size = self.path.stat().st_size
        except FileNotFoundError:
            self._offset = 0
            return
        if size < self._offset:  # truncated by someone else
            self._offset = 0
        if size > self._offset:
            budget = MAX_PER_TICK
            with open(self.path, "rb") as f:
                f.seek(self._offset)
                while budget > 0:
                    data = f.read(min(MAX_READ, budget))
                    if not data:
                        break
                    self._offset += len(data)
                    budget -= len(data)
                    self._feed(data)
        elif self._partial and time.monotonic() - self._partial_since > PARTIAL_FLUSH_S:
            self.buffer.append(_decode(self._partial))
            self._partial = b""

        policy = self._policy()
        if self._offset >= policy.max_bytes:
            rest = await asyncio.to_thread(rotate, self.path, policy.max_files, self._offset)
            self._offset = 0
            if len(rest) > MAX_PER_TICK:  # writer far ahead of us: keep the live view bounded
                skipped = len(rest) - MAX_READ
                self.buffer.append(f"[usm] {skipped} bytes skipped in live view (see {self.path.name}.1)")
                rest = rest[-MAX_READ:]
                rest = rest[rest.find(b"\n") + 1 :]
                self._partial = b""
            self._feed(rest)

    def _feed(self, data: bytes) -> None:
        if not self._partial:
            self._partial_since = time.monotonic()
        chunk = self._partial + data
        *lines, self._partial = chunk.split(b"\n")
        for raw in lines:
            self.buffer.append(_decode(raw))
        if lines:
            self._partial_since = time.monotonic()

    def write_marker(self, text: str) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "ab") as f:
            f.write(f"\n=== [usm] {text} ===\n".encode("utf-8"))
