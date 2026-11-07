from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel

from app.projects.schemas import DependsOn


class ServiceState(str, Enum):
    STOPPED = "STOPPED"
    WAITING_DEPS = "WAITING_DEPS"
    BLOCKED = "BLOCKED"  # a dependency failed / is stopped
    STARTING = "STARTING"
    HEALTHY = "HEALTHY"
    UNHEALTHY = "UNHEALTHY"
    BACKOFF = "BACKOFF"  # crashed, waiting before the next restart
    STOPPING = "STOPPING"
    FAILED = "FAILED"  # gave up (restart limit / policy 'never')
    COMPLETED = "COMPLETED"  # one_shot finished with exit 0
    EXITED = "EXITED"  # long_running exited 0 and policy says don't restart


class ProjectState(str, Enum):
    STOPPED = "STOPPED"
    RUNNING = "RUNNING"
    DEGRADED = "DEGRADED"
    TRANSITIONING = "TRANSITIONING"


class ProjectActionIn(BaseModel):
    action: Literal["start", "stop", "restart"]
    services: list[str] | None = None  # None = all (start: all enabled)


class ServiceActionIn(BaseModel):
    action: Literal["start", "stop", "restart", "kill", "reset"]


class ServiceStatusOut(BaseModel):
    id: str
    name: str
    kind: str
    enabled: bool
    state: ServiceState
    desired: Literal["RUNNING", "STOPPED"]
    message: str
    pid: int | None
    adopted: bool  # re-attached after a manager restart
    started_at: datetime | None
    uptime_s: float | None
    restart_count: int
    last_exit_code: int | None
    last_error: str | None
    log_path: str
    depends_on: list[DependsOn]
    # only with ?stats=true and while running (whole process tree)
    memory_rss: int | None = None
    cpu_percent: float | None = None
    process_count: int | None = None


class ProjectStatusOut(BaseModel):
    id: str
    name: str
    description: str
    autostart: bool
    state: ProjectState
    running: int
    total: int
    services: list[ServiceStatusOut]


class SystemStatusOut(BaseModel):
    version: str
    platform: str
    started_at: datetime
    projects: list[ProjectStatusOut]


class ProjectActionOut(BaseModel):
    action: str
    services: list[str]


class ServiceActionOut(BaseModel):
    action: str
    service: ServiceStatusOut
