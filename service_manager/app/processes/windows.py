"""Windows process control.

* Every service run lives in its own named **Job Object** -> one call kills the
  whole tree (npm -> node -> vite -> esbuild ...).
* The child is created SUSPENDED, assigned to the job, then resumed, so no
  grandchild can escape before the job exists.
* No KILL_ON_JOB_CLOSE: services survive a manager restart and are re-adopted.
* Each child gets its own hidden console (CREATE_NO_WINDOW). Graceful stop =
  a tiny helper attaches to that console and sends Ctrl+C.
* stdout/stderr go to a log file opened with FILE_APPEND_DATA only, so writes
  always land at EOF (this is what makes copy-truncate log rotation safe).
"""

from __future__ import annotations

import ctypes
import logging
import msvcrt
import os
import subprocess
import sys
import uuid

import psutil
import pywintypes
import win32api

import win32file
import win32job
import win32process

from app.processes.base import Platform, ProcessHandle, SpawnSpec, verify_process

log = logging.getLogger(__name__)

CREATE_SUSPENDED = 0x00000004
CREATE_NO_WINDOW = 0x08000000
CREATE_BREAKAWAY_FROM_JOB = 0x01000000
PROCESS_TERMINATE = 0x0001
PROCESS_SET_QUOTA = 0x0100
PROCESS_SUSPEND_RESUME = 0x0800
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
SYNCHRONIZE = 0x00100000
JOB_OBJECT_ALL_ACCESS = 0x1F001F
FILE_APPEND_DATA = 0x0004
STILL_ACTIVE = 259

_ntdll = ctypes.WinDLL("ntdll")
_kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

# Runs in a separate, short-lived process: a process can only send console
# control events to the console it is attached to.
CTRL_C_HELPER = r"""
import ctypes, sys, time
k = ctypes.WinDLL("kernel32", use_last_error=True)
k.FreeConsole()
for pid in map(int, sys.argv[1:]):
    if k.AttachConsole(pid):
        break
else:
    sys.exit(2)
k.SetConsoleCtrlHandler(None, True)
ok = k.GenerateConsoleCtrlEvent(0, 0)
time.sleep(0.3)
k.FreeConsole()
sys.exit(0 if ok else 3)
"""


def ctrl_c_helper_argv(pids: list[int]) -> list[str]:
    python = getattr(sys, "_base_executable", None) or sys.executable
    return [python, "-I", "-c", CTRL_C_HELPER, *map(str, pids)]


def _open_append_fd(path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = win32file.CreateFile(
        str(path),
        FILE_APPEND_DATA,
        win32file.FILE_SHARE_READ | win32file.FILE_SHARE_WRITE | win32file.FILE_SHARE_DELETE,
        None,
        win32file.OPEN_ALWAYS,
        win32file.FILE_ATTRIBUTE_NORMAL,
        None,
    )
    return msvcrt.open_osfhandle(handle.Detach(), os.O_APPEND | os.O_WRONLY)


def _assign(job, pid: int) -> None:
    h = win32api.OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, False, pid)
    try:
        win32job.AssignProcessToJobObject(job, h)
    finally:
        win32api.CloseHandle(h)


class WindowsHandle(ProcessHandle):
    def __init__(self, pid, create_time, job, job_name, popen=None, hproc=None):
        self._job = job
        self._hproc = hproc  # only for adopted processes (exit code)
        super().__init__(pid, create_time, job_name, popen)

    def _adopted_exit_code(self) -> int | None:
        if self._hproc is None:
            return None
        try:
            code = win32process.GetExitCodeProcess(self._hproc)
            return None if code == STILL_ACTIVE else int(code)
        except pywintypes.error:
            return None

    def _extra_tree_pids(self) -> list[int]:
        if self._job is None:
            return []
        try:
            return list(win32job.QueryInformationJobObject(self._job, win32job.JobObjectBasicProcessIdList))
        except pywintypes.error:
            return []

    def request_graceful_stop(self) -> bool:
        pids = [p.pid for p in self.tree()]
        if not pids:
            return False
        try:
            r = subprocess.run(
                ctrl_c_helper_argv(pids[:16]),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=CREATE_NO_WINDOW,
                timeout=10,
            )
            return r.returncode == 0
        except (OSError, subprocess.TimeoutExpired) as e:
            log.warning("ctrl+c helper failed for pid %s: %s", self.pid, e)
            return False

    def kill_tree(self) -> None:
        if self._job is not None:
            try:
                win32job.TerminateJobObject(self._job, 1)
            except pywintypes.error as e:
                log.debug("TerminateJobObject failed: %s", e)
        # belt and braces: anything that escaped the job
        self._kill_procs(self.tree())


class WindowsPlatform(Platform):
    name = "windows"

    def __init__(self) -> None:
        # If we were started with Ctrl+C ignored (e.g. by a parent using
        # CREATE_NEW_PROCESS_GROUP), children inherit that and graceful stop
        # would silently not work. Clear it.
        _kernel32.SetConsoleCtrlHandler(None, False)

    def _new_job(self, tag: str):
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in tag)[:80]
        name = f"Local\\USM-{safe}-{uuid.uuid4().hex[:8]}"
        return win32job.CreateJobObject(None, name), name

    def spawn(self, spec: SpawnSpec) -> WindowsHandle:
        job, job_name = self._new_job(spec.tag)
        fd = _open_append_fd(spec.log_path)
        try:
            kwargs = dict(
                cwd=spec.cwd,
                env=spec.env,
                stdin=subprocess.DEVNULL,
                stdout=fd,
                stderr=subprocess.STDOUT,
            )
            base_flags = CREATE_SUSPENDED | CREATE_NO_WINDOW
            try:
                # Escape the manager's own job (e.g. a terminal/IDE job that
                # kills everything when it closes).
                popen = subprocess.Popen(spec.argv, creationflags=base_flags | CREATE_BREAKAWAY_FROM_JOB, **kwargs)
            except PermissionError:
                popen = subprocess.Popen(spec.argv, creationflags=base_flags, **kwargs)
        finally:
            os.close(fd)

        try:
            h = win32api.OpenProcess(
                PROCESS_SET_QUOTA | PROCESS_TERMINATE | PROCESS_SUSPEND_RESUME, False, popen.pid
            )
            try:
                win32job.AssignProcessToJobObject(job, h)
                status = _ntdll.NtResumeProcess(ctypes.c_void_p(int(h)))
                if status != 0:
                    raise OSError(f"NtResumeProcess failed: 0x{status & 0xFFFFFFFF:08x}")
            finally:
                win32api.CloseHandle(h)
            create_time = psutil.Process(popen.pid).create_time()
        except Exception:
            popen.kill()
            raise
        return WindowsHandle(popen.pid, create_time, job, job_name, popen=popen)

    def adopt(self, pid: int, create_time: float, job_name: str | None) -> WindowsHandle | None:
        proc = verify_process(pid, create_time)
        if proc is None:
            return None
        job = None
        if job_name:
            try:
                job = win32job.OpenJobObject(JOB_OBJECT_ALL_ACCESS, False, job_name)
            except pywintypes.error:
                job = None  # name vanished when the old manager's handle closed
        if job is None:
            job, job_name = self._new_job(f"adopted-{pid}")
            try:
                members = [proc, *proc.children(recursive=True)]
            except psutil.Error:
                members = [proc]
            for p in members:
                try:
                    _assign(job, p.pid)
                except pywintypes.error as e:
                    log.debug("could not assign pid %s to job: %s", p.pid, e)
        try:
            hproc = win32api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, False, pid)
        except pywintypes.error:
            hproc = None
        return WindowsHandle(pid, create_time, job, job_name, popen=None, hproc=hproc)


__all__ = ["WindowsPlatform", "WindowsHandle", "ctrl_c_helper_argv"]
