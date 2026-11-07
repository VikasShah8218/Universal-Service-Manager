"""Linux/macOS process control: one session (= process group) per service run."""

from __future__ import annotations

import os
import signal
import subprocess

import psutil

from app.processes.base import Platform, ProcessHandle, SpawnSpec, verify_process


class PosixHandle(ProcessHandle):
    def _pgid_alive(self) -> bool:
        try:
            os.killpg(self.pid, 0)
            return True
        except (ProcessLookupError, PermissionError):
            return False

    def _extra_tree_pids(self) -> list[int]:
        # members of our process group that got re-parented after an intermediate exited
        out = []
        for p in psutil.process_iter(["pid"]):
            try:
                if os.getpgid(p.pid) == self.pid:
                    out.append(p.pid)
            except (ProcessLookupError, PermissionError, OSError):
                pass
        return out

    def request_graceful_stop(self) -> bool:
        try:
            os.killpg(self.pid, signal.SIGTERM)
            return True
        except (ProcessLookupError, PermissionError):
            return False

    def kill_tree(self) -> None:
        procs = self.tree()
        try:
            os.killpg(self.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
        self._kill_procs(procs)


class PosixPlatform(Platform):
    name = "posix"

    def spawn(self, spec: SpawnSpec) -> PosixHandle:
        spec.log_path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(spec.log_path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o640)
        try:
            popen = subprocess.Popen(
                spec.argv,
                cwd=spec.cwd,
                env=spec.env,
                stdin=subprocess.DEVNULL,
                stdout=fd,
                stderr=subprocess.STDOUT,
                start_new_session=True,  # own session/pgid, detached from our terminal
                close_fds=True,
            )
        finally:
            os.close(fd)
        create_time = psutil.Process(popen.pid).create_time()
        return PosixHandle(popen.pid, create_time, None, popen)

    def adopt(self, pid: int, create_time: float, job_name: str | None) -> PosixHandle | None:
        if verify_process(pid, create_time) is None:
            return None
        try:
            if os.getpgid(pid) != pid:
                return None
        except OSError:
            return None
        return PosixHandle(pid, create_time, None, None)
