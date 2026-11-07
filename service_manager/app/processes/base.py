"""Platform-neutral process handle.

A ProcessHandle represents the *whole process tree* of one service run, not just
the root PID. Concrete platforms decide how the tree is contained (Windows Job
Object, POSIX session/process group) and how a graceful stop is requested.
"""

from __future__ import annotations

import asyncio
import subprocess
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import psutil

CREATE_TIME_TOLERANCE_S = 1.0


@dataclass
class SpawnSpec:
    argv: list[str] | str  # str only for Windows cmd.exe command lines
    cwd: str
    env: dict[str, str]
    log_path: Path
    tag: str  # human-readable identity, e.g. "shah-nvr-central-manager"


def verify_process(pid: int, create_time: float | None) -> psutil.Process | None:
    """Return the process only if it is the *same* process (guards against PID reuse)."""
    try:
        p = psutil.Process(pid)
        if create_time is not None and abs(p.create_time() - create_time) > CREATE_TIME_TOLERANCE_S:
            return None
        if p.status() == psutil.STATUS_ZOMBIE:
            return None
        return p
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return None


class ProcessHandle(ABC):
    def __init__(self, pid: int, create_time: float, job_name: str | None, popen: subprocess.Popen | None):
        self.pid = pid
        self.create_time = create_time
        self.job_name = job_name
        self.owned = popen is not None
        self._popen = popen
        self._root: psutil.Process | None = verify_process(pid, create_time)
        loop = asyncio.get_running_loop()
        self._exit: asyncio.Future[int | None] = loop.create_future()
        if popen is not None:
            self._start_thread_waiter(loop, popen)
        else:
            self._poll_task = loop.create_task(self._poll_waiter())

    # ------------------------------------------------------------ exit tracking
    def _start_thread_waiter(self, loop: asyncio.AbstractEventLoop, popen: subprocess.Popen) -> None:
        # A dedicated thread per process: the default executor is too small to
        # hold one blocking wait() per service.
        def run() -> None:
            code = popen.wait()
            loop.call_soon_threadsafe(self._set_exit, code)

        threading.Thread(target=run, name=f"usm-wait-{self.pid}", daemon=True).start()

    async def _poll_waiter(self) -> None:
        while self.is_alive():
            await asyncio.sleep(0.5)
        self._set_exit(self._adopted_exit_code())

    def _adopted_exit_code(self) -> int | None:
        return None

    def _set_exit(self, code: int | None) -> None:
        if not self._exit.done():
            self._exit.set_result(code)

    async def wait(self) -> int | None:
        """Wait for the root process to exit. Safe to cancel; safe to call many times."""
        return await asyncio.shield(self._exit)

    @property
    def exited(self) -> bool:
        return self._exit.done()

    def is_alive(self) -> bool:
        if self._popen is not None:
            return self._popen.poll() is None
        p = self._root
        if p is None:
            return False
        try:
            return p.is_running() and p.status() != psutil.STATUS_ZOMBIE
        except psutil.Error:
            return False

    # ------------------------------------------------------------ tree
    def tree(self) -> list[psutil.Process]:
        """Root (if alive) plus all live descendants."""
        procs: list[psutil.Process] = []
        root = self._root
        if root is not None:
            try:
                if root.is_running():
                    procs.append(root)
                    procs.extend(root.children(recursive=True))
            except psutil.Error:
                pass
        seen = {p.pid for p in procs}
        for pid in self._extra_tree_pids():
            if pid not in seen:
                try:
                    procs.append(psutil.Process(pid))
                    seen.add(pid)
                except psutil.Error:
                    pass
        return procs

    def _extra_tree_pids(self) -> list[int]:
        """Platform hook: members we know about that are no longer descendants (orphans)."""
        return []

    def stats(self) -> dict:
        rss, cpu, count = 0, 0.0, 0
        for p in self.tree():
            try:
                with p.oneshot():
                    rss += p.memory_info().rss
                    cpu += p.cpu_percent(None)
                count += 1
            except psutil.Error:
                pass
        return {"memory_rss": rss, "cpu_percent": round(cpu, 1), "process_count": count}

    # ------------------------------------------------------------ control
    @abstractmethod
    def request_graceful_stop(self) -> bool:
        """Ask the tree to shut down. Returns True if the request was delivered."""

    @abstractmethod
    def kill_tree(self) -> None:
        """Forcefully terminate every process in the tree. Must be idempotent."""

    @staticmethod
    def _kill_procs(procs: list[psutil.Process]) -> None:
        for p in procs:
            try:
                p.kill()
            except psutil.Error:
                pass
        psutil.wait_procs(procs, timeout=3)


class Platform(ABC):
    name: str

    @abstractmethod
    def spawn(self, spec: SpawnSpec) -> ProcessHandle: ...

    @abstractmethod
    def adopt(self, pid: int, create_time: float, job_name: str | None) -> ProcessHandle | None: ...
