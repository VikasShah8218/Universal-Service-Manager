"""Project / service configuration.

ProjectSpec is the single validated shape of a project's config: the API
(JSON), YAML import/export and the database all go through it.
"""

import re
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from utilities.graph import CycleError, topo_layers

ID_PATTERN = r"^[a-z0-9][a-z0-9_-]{0,63}$"
Ident = Annotated[str, Field(pattern=ID_PATTERN)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------- probes


class _ProbeCommon(_Strict):
    # readiness: total time to wait for the probe to pass
    timeout_s: float = Field(60.0, gt=0, le=3600)
    # health checks: how often, how many consecutive failures before "unhealthy"
    interval_s: float = Field(10.0, ge=0.2, le=3600)
    failures: int = Field(3, ge=1, le=100)
    # a single probe attempt
    attempt_timeout_s: float = Field(3.0, gt=0, le=120)


class TcpProbe(_ProbeCommon):
    type: Literal["tcp"]
    host: str = "127.0.0.1"
    port: int = Field(ge=1, le=65535)


class HttpProbe(_ProbeCommon):
    type: Literal["http"]
    url: str
    expect_status: list[int] | None = None  # None -> any 2xx/3xx

    @field_validator("url")
    @classmethod
    def check_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("url must start with http:// or https://")
        return v


class LogRegexProbe(_ProbeCommon):
    type: Literal["log_regex"]
    pattern: str

    @field_validator("pattern")
    @classmethod
    def check_pattern(cls, v: str) -> str:
        try:
            re.compile(v)
        except re.error as e:
            raise ValueError(f"invalid regex: {e}") from e
        return v


class DelayProbe(_ProbeCommon):
    type: Literal["delay"]
    seconds: float = Field(ge=0, le=3600)


class ProcessProbe(_ProbeCommon):
    type: Literal["process"]


Probe = Annotated[
    Union[TcpProbe, HttpProbe, LogRegexProbe, DelayProbe, ProcessProbe],
    Field(discriminator="type"),
]
HEALTH_PROBE_TYPES = {"tcp", "http", "process"}


# ---------------------------------------------------------------- policies


class DependsOn(_Strict):
    id: Ident
    condition: Literal["started", "healthy", "completed"] = "healthy"

    @model_validator(mode="before")
    @classmethod
    def shorthand(cls, v: Any) -> Any:
        # allow `depends_on: [central-manager]`
        if isinstance(v, str):
            return {"id": v}
        return v


class RestartPolicy(_Strict):
    mode: Literal["never", "on_failure", "always"] = "on_failure"
    max: int = Field(5, ge=0, le=10_000)  # attempts within window_s; 0 = unlimited
    window_s: float = Field(600.0, gt=0)
    backoff: list[float] = Field(default_factory=lambda: [1, 2, 5, 15, 30], min_length=1)

    @field_validator("backoff")
    @classmethod
    def non_negative(cls, v: list[float]) -> list[float]:
        if any(x < 0 for x in v):
            raise ValueError("backoff values must be >= 0")
        return v


class StopPolicy(_Strict):
    graceful: bool = True  # Ctrl+C (Windows) / SIGTERM (POSIX) first
    timeout_s: float = Field(10.0, ge=0, le=600)


class LogPolicy(_Strict):
    max_bytes: int = Field(10 * 1024 * 1024, ge=64 * 1024)
    max_files: int = Field(5, ge=1, le=100)
    buffer_lines: int = Field(2000, ge=100, le=100_000)


# ---------------------------------------------------------------- service / project


class ServiceSpec(_Strict):
    id: Ident
    name: str | None = None
    enabled: bool = True
    kind: Literal["long_running", "one_shot"] = "long_running"
    command: list[str] | str
    shell: bool = False
    cwd: str | None = None
    env: dict[str, str] = Field(default_factory=dict)
    env_file: str | None = None
    depends_on: list[DependsOn] = Field(default_factory=list)
    readiness: Probe | None = None
    health_checks: list[Probe] = Field(default_factory=list)
    start_period_s: float = Field(0.0, ge=0, le=3600)
    restart_policy: RestartPolicy = Field(default_factory=RestartPolicy)
    stop_policy: StopPolicy = Field(default_factory=StopPolicy)
    log_policy: LogPolicy = Field(default_factory=LogPolicy)

    @model_validator(mode="after")
    def check_service(self) -> "ServiceSpec":
        if isinstance(self.command, str):
            if not self.shell:
                raise ValueError(
                    f"service '{self.id}': command must be a list of arguments "
                    "(or set shell: true to use a shell string)"
                )
            if not self.command.strip():
                raise ValueError(f"service '{self.id}': command is empty")
        elif not self.command or not self.command[0].strip():
            raise ValueError(f"service '{self.id}': command is empty")
        for hc in self.health_checks:
            if hc.type not in HEALTH_PROBE_TYPES:
                raise ValueError(
                    f"service '{self.id}': health check type '{hc.type}' not allowed "
                    f"(use one of {sorted(HEALTH_PROBE_TYPES)})"
                )
        if any(d.id == self.id for d in self.depends_on):
            raise ValueError(f"service '{self.id}' depends on itself")
        return self

    @property
    def display_name(self) -> str:
        return self.name or self.id


class ProjectSpec(_Strict):
    id: Ident
    name: str | None = None
    description: str = ""
    autostart: bool = False  # start on machine boot
    cwd: str | None = None  # base dir for relative service cwd
    env: dict[str, str] = Field(default_factory=dict)
    env_file: str | None = None
    services: list[ServiceSpec] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_project(self) -> "ProjectSpec":
        ids = [s.id for s in self.services]
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        if dupes:
            raise ValueError(f"duplicate service ids: {', '.join(dupes)}")
        known = set(ids)
        for s in self.services:
            for d in s.depends_on:
                if d.id not in known:
                    raise ValueError(f"service '{s.id}' depends on unknown service '{d.id}'")
        try:
            topo_layers(self.graph())
        except CycleError as e:
            raise ValueError(str(e)) from e
        return self

    def graph(self) -> dict[str, list[str]]:
        return {s.id: [d.id for d in s.depends_on] for s in self.services}

    def service(self, service_id: str) -> ServiceSpec | None:
        return next((s for s in self.services if s.id == service_id), None)

    @property
    def display_name(self) -> str:
        return self.name or self.id


# ---------------------------------------------------------------- API outputs


class ApplyResultOut(BaseModel):
    created: bool
    added: list[str] = []
    removed: list[str] = []
    changed: list[str] = []  # config changed (running ones keep the old config until restarted)
    restarted: list[str] = []
