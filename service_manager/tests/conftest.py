"""Never let tests touch the developer's real database or data folder."""

import os
import tempfile

# Set before test modules import settings/database.config/main.
os.environ["DATABASE_URL"] = "sqlite://:memory:"
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="usm-test-")
os.environ["WATCHDOG_STALL_SECONDS"] = "0"

import asyncio  # noqa: E402
import socket  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
from pathlib import Path  # noqa: E402

import psutil  # noqa: E402
import pytest  # noqa: E402
from tortoise import Tortoise  # noqa: E402

from app.projects.schemas import ProjectSpec  # noqa: E402
from app.runtime.services import Engine, set_engine  # noqa: E402
from database.config import APP_MODELS  # noqa: E402
from settings.settings import settings  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
PY = sys.executable


def fixture_cmd(name: str, *args: str) -> list[str]:
    return [PY, str(FIXTURES / name), *args]


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def svc(id: str, command: list[str], **kw) -> dict:
    base = {
        "id": id,
        "command": command,
        "restart_policy": {"mode": "on_failure", "max": 3, "window_s": 60, "backoff": [0.2]},
        "stop_policy": {"timeout_s": 5},
    }
    base.update(kw)
    return base


def project(id: str, services: list[dict], tmp_path: Path, **kw) -> ProjectSpec:
    return ProjectSpec.model_validate({"id": id, "cwd": str(tmp_path), "services": services, **kw})


async def wait_until(pred, timeout: float = 15.0, interval: float = 0.1, msg: str = "condition"):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if pred():
            return
        await asyncio.sleep(interval)
    raise AssertionError(f"timed out waiting for {msg}")


def pid_alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        return psutil.Process(pid).status() != psutil.STATUS_ZOMBIE
    except psutil.NoSuchProcess:
        return False


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    """Each test gets its own data folder (service logs, token)."""
    monkeypatch.setattr(settings, "DATA_DIR", tmp_path / "data")
    return settings.DATA_DIR


@pytest.fixture
async def db(tmp_path):
    """A real SQLite file, so tests can restart the engine and keep the database."""
    await Tortoise.init(db_url=f"sqlite://{(tmp_path / 'test.sqlite3').as_posix()}", modules={"models": APP_MODELS})
    await Tortoise.generate_schemas()
    try:
        yield
    finally:
        await Tortoise.close_connections()


@pytest.fixture
async def engine(db):
    eng = Engine()
    await eng.start()
    set_engine(eng)
    try:
        yield eng
    finally:
        await eng.shutdown(stop_services=True)
        set_engine(None)
