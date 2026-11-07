import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    APP_NAME: str = "Universal Service Manager"
    VERSION: str = "0.2.0"
    # Loopback only: this API starts arbitrary commands on this machine.
    HOST: str = "127.0.0.1"
    PORT: int = 7420
    LOG_LEVEL: str = "INFO"

    # Data: database file, API token, manager log, one log folder per service
    DATA_DIR: Path = BASE_DIR / "data"

    # Database. Default is a local SQLite file so the manager never depends on a
    # database server it might itself be managing. Full override, e.g.
    # "postgres://user:pass@localhost:5432/usm".
    DATABASE_URL: str | None = None

    # Supervision
    # Services keep running when the manager exits (and are re-adopted on start).
    STOP_SERVICES_ON_EXIT: bool = False
    # Exit if the event loop is stuck this long, so an OS supervisor can restart us (0 = off).
    WATCHDOG_STALL_SECONDS: float = 60.0
    # Events kept in the database (older ones are pruned).
    EVENTS_KEEP: int = 50_000

    @property
    def db_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"sqlite://{(self.DATA_DIR / 'usm.sqlite3').as_posix()}"

    @property
    def logs_dir(self) -> Path:
        return self.DATA_DIR / "logs"

    @property
    def token_path(self) -> Path:
        return self.DATA_DIR / "token"

    @property
    def lock_path(self) -> Path:
        return self.DATA_DIR / "manager.lock"

    @property
    def manager_log_path(self) -> Path:
        return self.DATA_DIR / "manager.log"

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.PORT}"

    def ensure_dirs(self) -> None:
        self.logs_dir.mkdir(parents=True, exist_ok=True)

    def read_token(self) -> str | None:
        try:
            return self.token_path.read_text(encoding="utf-8").strip() or None
        except FileNotFoundError:
            return None

    def read_or_create_token(self) -> str:
        token = self.read_token()
        if token:
            return token
        self.ensure_dirs()
        token = secrets.token_urlsafe(32)
        self.token_path.write_text(token, encoding="utf-8")
        return token


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
