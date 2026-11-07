import asyncio
import logging
import sys
import time
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("usm")

IS_WINDOWS = sys.platform == "win32"


class NotFoundError(Exception):
    """Mapped to HTTP 404 in main.py."""


class ConflictError(Exception):
    """Mapped to HTTP 409 in main.py."""


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def from_epoch(ts: float | None) -> datetime | None:
    return None if ts is None else datetime.fromtimestamp(ts, timezone.utc)


def boot_clock() -> float:
    """A clock that keeps running during system sleep (to detect suspend/resume)."""
    if hasattr(time, "CLOCK_BOOTTIME"):
        return time.clock_gettime(time.CLOCK_BOOTTIME)
    return time.monotonic()  # Windows: GetTickCount64, includes sleep


async def race(**aws: Any) -> tuple[str, Any]:
    """Run awaitables concurrently; return (name, result) of the first to finish, cancel the rest."""
    tasks = {name: asyncio.ensure_future(a) for name, a in aws.items()}
    try:
        await asyncio.wait(tasks.values(), return_when=asyncio.FIRST_COMPLETED)
    finally:
        pending = [t for t in tasks.values() if not t.done()]
        for t in pending:
            t.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
    for name, t in tasks.items():
        if t.done() and not t.cancelled():
            return name, t.result()
    raise asyncio.CancelledError()


async def run_periodic(name: str, interval: float, func: Callable[[], Awaitable[None]]) -> None:
    """Run `func` forever every `interval` seconds; errors are logged, never fatal."""
    logger.info("Background loop '%s' started (every %ss)", name, interval)
    while True:
        try:
            await func()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Background loop '%s' failed", name)
        await asyncio.sleep(interval)
