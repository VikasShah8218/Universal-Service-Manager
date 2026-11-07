"""Per-service supervisor: one asyncio task + state machine per service.

`desired` (RUNNING/STOPPED) is what the user wants; `state` is what we observe.
The lifecycle task reconciles the two:

  WAITING_DEPS -> STARTING -> HEALTHY <-> UNHEALTHY
        |            |           |
     BLOCKED      (exit/timeout/unhealthy) -> BACKOFF -> (retry) ... -> FAILED
  user stop -> STOPPING -> STOPPED   (never auto-restarted while desired=STOPPED)
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid
from collections import deque
from typing import TYPE_CHECKING, Any

from app.events.services import recorder
from app.health import services as probes
from app.logs.services import LogBuffer, LogTailer
from app.processes import ProcessHandle, SpawnSpec
from app.processes.launch import ResolveError, build_launch, port_owner, service_local_ports
from app.projects.schemas import DependsOn, ServiceSpec
from app.runtime import utils as store
from app.runtime.schemas import ServiceState as State
from settings.settings import settings
from utilities.common import boot_clock, from_epoch, race

if TYPE_CHECKING:
    from app.runtime.services import Engine, ProjectRuntime

logger = logging.getLogger("usm.supervisor")

PROCESS_UP = {State.STARTING, State.HEALTHY, State.UNHEALTHY}
SETTLED_DOWN = {State.STOPPED, State.FAILED, State.COMPLETED, State.EXITED}


class SpawnError(Exception):
    pass


class ServiceSupervisor:
    def __init__(self, rt: "ProjectRuntime", spec: ServiceSpec, engine: "Engine"):
        self.rt = rt
        self.spec = spec
        self.engine = engine
        self.state = State.STOPPED
        self.message = ""
        self.desired = "STOPPED"
        self.handle: ProcessHandle | None = None
        self.started_at: float | None = None
        self.last_exit_code: int | None = None
        self.last_error: str | None = None
        self.restart_count = 0
        self._attempts: deque[float] = deque()
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()
        self._op_lock = asyncio.Lock()
        self._log_event: asyncio.Event | None = None
        self.log_path = settings.logs_dir / rt.id / spec.id / "output.log"
        self.logs = LogBuffer(spec.log_policy.buffer_lines)
        self.tailer = LogTailer(self.log_path, self.logs, lambda: self.spec.log_policy)
        self._tail_task: asyncio.Task | None = None

    # ------------------------------------------------------------------ identity / reporting
    @property
    def id(self) -> str:
        return self.spec.id

    @property
    def key(self) -> str:
        return f"{self.rt.id}/{self.spec.id}"

    def snapshot(self, with_stats: bool = False) -> dict[str, Any]:
        h = self.handle
        alive = h is not None and h.is_alive()
        data: dict[str, Any] = {
            "id": self.id,
            "name": self.spec.display_name,
            "kind": self.spec.kind,
            "enabled": self.spec.enabled,
            "state": self.state,
            "desired": self.desired,
            "message": self.message,
            "pid": h.pid if alive else None,
            "adopted": bool(h and not h.owned),
            "started_at": from_epoch(self.started_at) if alive else None,
            "uptime_s": round(time.time() - self.started_at, 1) if alive and self.started_at else None,
            "restart_count": self.restart_count,
            "last_exit_code": self.last_exit_code,
            "last_error": self.last_error,
            "log_path": str(self.log_path),
            "depends_on": [d.model_dump() for d in self.spec.depends_on],
        }
        if with_stats and alive:
            data.update(h.stats())
        return data

    def _event(self, kind: str, message: str, **data: Any) -> None:
        recorder.record(self.rt.id, self.id, kind, message, data or None)

    def _set_state(self, state: State, message: str = "") -> None:
        if state == self.state and message == self.message:
            return
        prev = self.state
        self.state, self.message = state, message
        text = f"{prev.value} -> {state.value}" + (f": {message}" if message else "")
        logger.info("[%s] %s", self.key, text)
        recorder.record(self.rt.id, self.id, "state", text, {"from": prev.value, "to": state.value})
        self.engine.notify()

    async def _set_desired(self, desired: str) -> None:
        self.desired = desired
        await store.set_desired(self.rt.id, self.id, desired)

    # ------------------------------------------------------------------ background
    def start_background(self, preload_logs: bool = True) -> None:
        if preload_logs:
            self.tailer.preload()
        self._tail_task = asyncio.create_task(self.tailer.run(), name=f"tail:{self.key}")

    async def detach(self) -> None:
        """Stop supervising WITHOUT touching the processes (manager shutdown: services keep running)."""
        for t in (self._task, self._tail_task):
            if t and not t.done():
                t.cancel()
        await asyncio.gather(*(t for t in (self._task, self._tail_task) if t), return_exceptions=True)
        self._task = self._tail_task = None

    # ------------------------------------------------------------------ commands
    @property
    def busy(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self, actor: str = "user") -> bool:
        async with self._op_lock:
            await self._set_desired("RUNNING")
            if self.busy:
                return False
            self._stop_event = asyncio.Event()
            self._attempts.clear()
            self.last_error = None
            self._task = asyncio.create_task(self._lifecycle(), name=f"svc:{self.key}")
            self._event("start_requested", f"start requested by {actor}", actor=actor)
            return True

    async def adopt(self, handle: ProcessHandle, started_at: float | None) -> None:
        async with self._op_lock:
            self.desired = "RUNNING"
            self.started_at = started_at or time.time()
            await store.set_process(self.rt.id, self.id, handle.pid, handle.create_time, handle.job_name,
                                    self.started_at)
            self._stop_event = asyncio.Event()
            self._event("adopted", f"re-adopted running process pid {handle.pid}", pid=handle.pid)
            self._task = asyncio.create_task(self._lifecycle(adopted=handle), name=f"svc:{self.key}")

    async def stop(self, actor: str = "user", persist: bool = True) -> None:
        async with self._op_lock:
            if persist:
                await self._set_desired("STOPPED")
            self._stop_event.set()
            task = self._task
            if self.handle is not None:
                self._set_state(State.STOPPING, f"requested by {actor}")
                await self._terminate(graceful=True)
            if task is not None and not task.done():
                try:
                    await asyncio.wait_for(asyncio.shield(task), 10)
                except asyncio.TimeoutError:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
            if self.handle is not None:  # spawned while we were stopping
                await self._terminate(graceful=True)
            self._task = None
            self._set_state(State.STOPPED, f"stopped by {actor}")

    async def kill(self, actor: str = "user") -> None:
        """Hard kill (no graceful phase). Restart policy still applies if desired=RUNNING."""
        h = self.handle
        if h is not None:
            self._event("kill", f"killed by {actor}", actor=actor)
            await asyncio.to_thread(h.kill_tree)

    # ------------------------------------------------------------------ lifecycle
    async def _lifecycle(self, adopted: ProcessHandle | None = None) -> None:
        try:
            while not self._stop_event.is_set():
                outcome: tuple | None
                if adopted is not None:
                    self.handle, adopted = adopted, None
                    outcome = None
                    ready_msg = f"adopted pid {self.handle.pid}"
                else:
                    if not await self._wait_deps():
                        return
                    try:
                        await self._spawn()
                    except SpawnError as e:
                        self.last_error = str(e)
                        self._event("spawn_failed", str(e))
                        outcome = ("spawn_error", str(e))
                    else:
                        self._set_state(State.STARTING, f"pid {self.handle.pid}")
                        outcome, ready_msg = await self._await_ready()

                if outcome is None:
                    self._set_state(State.HEALTHY, ready_msg)
                    outcome = await self._monitor()

                if outcome[0] == "stop" or self._stop_event.is_set():
                    return

                if self.handle is not None:
                    await self._terminate(graceful=outcome[0] in ("unhealthy", "ready_timeout"))
                if self._stop_event.is_set() or not self._should_restart(outcome):
                    return

                desc = self._describe(outcome)
                policy = self.spec.restart_policy
                if not self._consume_attempt():
                    self.last_error = desc
                    self._set_state(State.FAILED, f"{desc}; gave up after {policy.max} restarts in {policy.window_s:g}s")
                    return
                n = len(self._attempts)
                delay = policy.backoff[min(n - 1, len(policy.backoff) - 1)]
                self.restart_count += 1
                self._set_state(State.BACKOFF, f"{desc}; restart #{n} in {delay:g}s")
                try:
                    await asyncio.wait_for(self._stop_event.wait(), delay)
                    return
                except asyncio.TimeoutError:
                    pass
        except asyncio.CancelledError:
            raise
        except Exception as e:  # never let one service take the manager down
            logger.exception("[%s] supervisor crashed", self.key)
            self.last_error = f"internal error: {e!r}"
            self._set_state(State.FAILED, self.last_error)

    @staticmethod
    def _describe(outcome: tuple) -> str:
        if outcome[0] == "exit":
            return "exited (code unknown)" if outcome[1] is None else f"exited with code {outcome[1]}"
        return str(outcome[1])

    def _should_restart(self, outcome: tuple) -> bool:
        mode = self.spec.restart_policy.mode
        if outcome[0] == "exit" and outcome[1] == 0:
            if self.spec.kind == "one_shot":
                self._set_state(State.COMPLETED, "finished successfully (exit 0)")
                return False
            if mode != "always":
                self._set_state(State.EXITED, "exited with code 0")
                return False
            return True
        if mode == "never":
            desc = self._describe(outcome)
            self.last_error = desc
            self._set_state(State.FAILED, f"{desc}; restart policy is 'never'")
            return False
        return True

    def _consume_attempt(self) -> bool:
        policy = self.spec.restart_policy
        now = time.monotonic()
        while self._attempts and now - self._attempts[0] > policy.window_s:
            self._attempts.popleft()
        if policy.max and len(self._attempts) >= policy.max:
            return False
        self._attempts.append(now)
        return True

    # ------------------------------------------------------------------ dependencies
    def _dep_status(self, dep: DependsOn) -> str:
        other = self.rt.supervisors.get(dep.id)
        if other is None:
            return "blocked"
        st = other.state
        if dep.condition == "started":
            ok = st in PROCESS_UP or st == State.COMPLETED
        elif dep.condition == "healthy":
            ok = st == State.HEALTHY or (other.spec.kind == "one_shot" and st == State.COMPLETED)
        else:
            ok = st == State.COMPLETED
        if ok:
            return "ok"
        if st in (State.FAILED, State.BLOCKED, State.EXITED) or (st in SETTLED_DOWN and other.desired == "STOPPED"):
            return "blocked"
        return "pending"

    async def _wait_deps(self) -> bool:
        deps = self.spec.depends_on
        if not deps:
            return True
        while not self._stop_event.is_set():
            statuses = {d.id: self._dep_status(d) for d in deps}
            if all(s == "ok" for s in statuses.values()):
                return True
            waiting = ", ".join(f"{k} ({s})" for k, s in statuses.items() if s != "ok")
            blocked = any(s == "blocked" for s in statuses.values())
            self._set_state(State.BLOCKED if blocked else State.WAITING_DEPS, f"waiting for {waiting}")
            name, _ = await race(stop=self._stop_event.wait(), change=self.engine.wait_change(1.0))
            if name == "stop":
                return False
        return False

    # ------------------------------------------------------------------ process
    def _port_conflict(self) -> str | None:
        for port in sorted(service_local_ports(self.spec)):
            owner = port_owner(port)
            if owner:
                who = f"pid {owner['pid']} ({owner['name']})" if owner["pid"] else "another process"
                return f"port {port} is already in use by {who}"
        return None

    def _arm_log_regex(self, run_id: str) -> None:
        self._log_event = None
        self.logs.on_line = None
        probe = self.spec.readiness
        if probe is None or probe.type != "log_regex":
            return
        event = asyncio.Event()
        pattern = re.compile(probe.pattern)
        seen_marker = False

        def on_line(text: str) -> None:
            nonlocal seen_marker
            if not seen_marker:  # ignore output from previous runs still being tailed
                seen_marker = run_id in text
                return
            if pattern.search(text):
                event.set()

        self._log_event = event
        self.logs.on_line = on_line

    async def _spawn(self) -> None:
        try:
            plan = build_launch(self.rt.spec, self.spec)
        except ResolveError as e:
            raise SpawnError(str(e)) from e
        conflict = await asyncio.to_thread(self._port_conflict)
        if conflict:
            raise SpawnError(conflict)

        run_id = uuid.uuid4().hex[:10]
        self.tailer.write_marker(f"run {run_id} start {time.strftime('%Y-%m-%d %H:%M:%S')} :: {plan.display}")
        self._arm_log_regex(run_id)
        try:
            handle = self.engine.platform.spawn(
                SpawnSpec(argv=plan.argv, cwd=plan.cwd, env=plan.env, log_path=self.log_path,
                          tag=self.key.replace("/", "-"))
            )
        except OSError as e:
            raise SpawnError(f"failed to start '{plan.display}': {e}") from e
        self.handle = handle
        self.started_at = time.time()
        self.last_exit_code = None
        await store.set_process(self.rt.id, self.id, handle.pid, handle.create_time, handle.job_name,
                                self.started_at)
        self._event("started", f"pid {handle.pid}: {plan.display}", pid=handle.pid, cwd=plan.cwd)

    def _probe_ctx(self) -> probes.ProbeContext:
        h = self.handle
        return probes.ProbeContext(
            is_alive=lambda: h is not None and h.is_alive(),
            http=self.engine.http,
            log_matched=self._log_event,
        )

    async def _await_ready(self) -> tuple[tuple | None, str]:
        assert self.handle is not None
        name, res = await race(
            exit=self.handle.wait(),
            stop=self._stop_event.wait(),
            ready=probes.wait_ready(self.spec.readiness, self._probe_ctx()),
        )
        if name == "stop":
            return ("stop",), ""
        if name == "exit":
            self.last_exit_code = res
            return ("exit", res), ""
        ok, msg = res
        if ok:
            return None, msg
        if not self.handle.is_alive():  # died right at the end of the readiness window
            code = await self.handle.wait()
            self.last_exit_code = code
            return ("exit", code), ""
        return ("ready_timeout", msg), ""

    async def _monitor(self) -> tuple:
        assert self.handle is not None
        aws: dict[str, Any] = {"exit": self.handle.wait(), "stop": self._stop_event.wait()}
        if self.spec.kind == "long_running" and self.spec.health_checks:
            aws["unhealthy"] = self._health_loop()
        name, res = await race(**aws)
        if name == "exit":
            self.last_exit_code = res
            return ("exit", res)
        if name == "stop":
            return ("stop",)
        return ("unhealthy", res)

    async def _health_loop(self) -> str:
        if self.spec.start_period_s:
            await asyncio.sleep(self.spec.start_period_s)
        watchers = {f"check{i}": self._watch_check(i, c) for i, c in enumerate(self.spec.health_checks)}
        _, msg = await race(**watchers)
        return msg

    async def _watch_check(self, index: int, check) -> str:
        ctx = self._probe_ctx()
        fails = 0
        last = boot_clock()
        while True:
            await asyncio.sleep(check.interval_s)
            now = boot_clock()
            gap, last = now - last, now
            if gap > check.interval_s * 2 + 10:
                # machine slept / VM paused: everything looks dead for a moment. Grace.
                fails = 0
                self._event("clock_jump", f"{gap:.0f}s gap detected (sleep/resume?); health grace applied")
                continue
            ok, msg = await probes.check(check, ctx)
            last = boot_clock()
            if ok:
                if fails:
                    self._event("health_recovered", f"check {index} ({check.type}) recovered: {msg}")
                    if self.state == State.UNHEALTHY:
                        self._set_state(State.HEALTHY, msg)
                fails = 0
                continue
            fails += 1
            self._set_state(State.UNHEALTHY, f"check {index} ({check.type}) failed {fails}/{check.failures}: {msg}")
            if fails >= check.failures:
                return f"unhealthy: {check.type} check failed {fails}x ({msg})"

    async def _terminate(self, graceful: bool) -> None:
        h = self.handle
        if h is None:
            return
        policy = self.spec.stop_policy
        if graceful and policy.graceful and h.is_alive():
            sent = await asyncio.to_thread(h.request_graceful_stop)
            if sent:
                try:
                    await asyncio.wait_for(h.wait(), policy.timeout_s)
                except asyncio.TimeoutError:
                    self._event("stop_timeout", f"did not exit within {policy.timeout_s:g}s; killing")
        # always sweep the tree: kills leftovers (e.g. vite after npm exited)
        await asyncio.to_thread(h.kill_tree)
        try:
            code = await asyncio.wait_for(h.wait(), 5)
        except asyncio.TimeoutError:
            code = None
            self._event("kill_failed", f"pid {h.pid} still alive after kill")
        if self.last_exit_code is None:
            self.last_exit_code = code
        if self.handle is h:
            self.handle = None
            await store.clear_process(self.rt.id, self.id)
