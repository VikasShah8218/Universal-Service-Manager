"""Readiness and health probes (one attempt = `check`, readiness wait = `wait_ready`)."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from dataclasses import dataclass

import httpx

from app.projects.schemas import Probe


@dataclass
class ProbeContext:
    is_alive: Callable[[], bool]
    http: httpx.AsyncClient
    log_matched: asyncio.Event | None = None


async def check(probe: Probe, ctx: ProbeContext) -> tuple[bool, str]:
    """One probe attempt. Never raises."""
    try:
        if probe.type == "tcp":
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(probe.host, probe.port), probe.attempt_timeout_s
            )
            writer.close()
            try:
                await writer.wait_closed()
            except OSError:
                pass
            return True, f"tcp {probe.host}:{probe.port} open"
        if probe.type == "http":
            resp = await ctx.http.get(probe.url, timeout=probe.attempt_timeout_s)
            ok = (
                resp.status_code in probe.expect_status
                if probe.expect_status
                else 200 <= resp.status_code < 400
            )
            return ok, f"HTTP {resp.status_code} from {probe.url}"
        if probe.type == "process":
            alive = ctx.is_alive()
            return alive, "process alive" if alive else "process not running"
        if probe.type == "log_regex":
            hit = ctx.log_matched is not None and ctx.log_matched.is_set()
            return hit, "log pattern matched" if hit else f"waiting for log /{probe.pattern}/"
        if probe.type == "delay":
            return ctx.is_alive(), "delay elapsed"
    except asyncio.TimeoutError:
        return False, f"{probe.type} probe timed out after {probe.attempt_timeout_s}s"
    except (OSError, httpx.HTTPError) as e:
        return False, f"{probe.type} probe failed: {type(e).__name__}: {e}".rstrip(": ")
    return False, f"unknown probe type {probe.type}"


async def wait_ready(probe: Probe | None, ctx: ProbeContext) -> tuple[bool, str]:
    """Wait until the service is ready, or the readiness timeout expires."""
    if probe is None:
        # No explicit readiness: survive one second and call it ready.
        await asyncio.sleep(1.0)
        return ctx.is_alive(), "running (no readiness probe)"
    if probe.type == "delay":
        await asyncio.sleep(probe.seconds)
        return ctx.is_alive(), f"ready after {probe.seconds}s delay"

    deadline = time.monotonic() + probe.timeout_s
    last = ""
    while True:
        ok, msg = await check(probe, ctx)
        if ok:
            return True, msg
        last = msg
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False, f"not ready after {probe.timeout_s:g}s ({last})"
        await asyncio.sleep(min(0.5, remaining))
