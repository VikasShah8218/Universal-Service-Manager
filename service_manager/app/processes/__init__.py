"""Process control: spawn a service's process tree, stop it, kill it, re-adopt it.

Imports of the platform modules are lazy (pywin32 only on Windows).
"""

from functools import lru_cache

from app.processes.base import Platform, ProcessHandle, SpawnSpec
from utilities.common import IS_WINDOWS


@lru_cache(maxsize=1)
def get_platform() -> Platform:
    if IS_WINDOWS:
        from app.processes.windows import WindowsPlatform

        return WindowsPlatform()
    from app.processes.posix import PosixPlatform

    return PosixPlatform()


__all__ = ["IS_WINDOWS", "Platform", "ProcessHandle", "SpawnSpec", "get_platform"]
