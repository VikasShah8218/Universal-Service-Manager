"""Process-level guards for the manager: one instance per DATA_DIR, and a hang watchdog."""

import asyncio
import hashlib
import logging
import os
import threading
import time

from settings.settings import Settings
from utilities.common import IS_WINDOWS

logger = logging.getLogger("usm")


class AlreadyRunning(RuntimeError):
    pass


class SingleInstance:
    """One manager per DATA_DIR. Windows: named mutex. POSIX: flock on a lock file."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self._handle = None

    def acquire(self) -> None:
        self.settings.ensure_dirs()
        data_dir = self.settings.DATA_DIR.resolve()
        if IS_WINDOWS:
            import win32api
            import win32event
            import winerror

            digest = hashlib.sha1(str(data_dir).lower().encode()).hexdigest()[:16]
            self._handle = win32event.CreateMutex(None, False, f"Local\\USM-Manager-{digest}")
            if win32api.GetLastError() == winerror.ERROR_ALREADY_EXISTS:
                raise AlreadyRunning(f"a service manager is already running for {data_dir}")
        else:
            import fcntl

            f = open(self.settings.lock_path, "a+")
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                f.close()
                raise AlreadyRunning(f"a service manager is already running for {data_dir}") from None
            f.seek(0)
            f.truncate()
            f.write(str(os.getpid()))
            f.flush()
            self._handle = f


class Watchdog:
    """Detects a hung event loop and exits the process (exit code 70) so it can be restarted."""

    def __init__(self, stall_s: float):
        self.stall_s = stall_s
        self._beat = time.monotonic()
        self._thread_started = False

    async def heartbeat(self) -> None:
        while True:
            self._beat = time.monotonic()
            await asyncio.sleep(1)

    def start_thread(self) -> None:
        if self._thread_started or self.stall_s <= 0:
            return
        self._thread_started = True

        def watch() -> None:
            while True:
                time.sleep(5)
                stalled = time.monotonic() - self._beat
                if stalled > self.stall_s:
                    logger.critical("event loop stalled for %.0fs; exiting for restart", stalled)
                    logging.shutdown()
                    os._exit(70)

        threading.Thread(target=watch, name="usm-watchdog", daemon=True).start()
