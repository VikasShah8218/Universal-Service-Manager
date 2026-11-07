"""Runtime engine: owns every project's supervisors. Routers only talk to `get_engine()`."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx
import psutil

from app.events.services import audit, recorder
from app.processes import Platform, get_platform
from app.projects import services as project_store
from app.projects.schemas import ProjectSpec
from app.runtime import utils as store
from app.runtime.schemas import ProjectState
from app.runtime.schemas import ServiceState as State
from app.runtime.supervisor import PROCESS_UP, ServiceSupervisor
from settings.settings import settings
from utilities.common import ConflictError, NotFoundError, from_epoch
from utilities.graph import dependencies_closure, topo_layers

logger = logging.getLogger("usm.runtime")


# ---------------------------------------------------------------- one project


class ProjectRuntime:
    """Dependency order, bulk start/stop and config changes for one project."""

    def __init__(self, spec: ProjectSpec, engine: "Engine"):
        self.spec = spec
        self.engine = engine
        self.supervisors: dict[str, ServiceSupervisor] = {s.id: ServiceSupervisor(self, s, engine) for s in spec.services}

    @property
    def id(self) -> str:
        return self.spec.id

    def _check(self, services: list[str] | None) -> list[str]:
        if not services:
            return [s.id for s in self.spec.services]
        unknown = [s for s in services if s not in self.supervisors]
        if unknown:
            raise NotFoundError(f"unknown service(s) in '{self.id}': {', '.join(unknown)}")
        return list(services)

    def _layers(self, ids: set[str]) -> list[list[str]]:
        graph = self.spec.graph()
        return topo_layers({k: v for k, v in graph.items() if k in ids})

    async def start(self, services: list[str] | None = None, actor: str = "user") -> list[str]:
        """Start services (default: all enabled) plus everything they depend on, in order."""
        targets = set(self._check(services)) if services else {s.id for s in self.spec.services if s.enabled}
        targets = dependencies_closure(self.spec.graph(), targets)
        started = []
        for layer in self._layers(targets):
            for sid in layer:
                # each supervisor waits for its own deps; we only kick them off in order
                await self.supervisors[sid].start(actor=actor)
                started.append(sid)
        return started

    async def stop(self, services: list[str] | None = None, actor: str = "user", persist: bool = True) -> list[str]:
        """Stop services in reverse dependency order (dependents first)."""
        targets = set(self._check(services))
        stopped = []
        for layer in reversed(self._layers(targets)):
            await asyncio.gather(*(self.supervisors[s].stop(actor=actor, persist=persist) for s in layer))
            stopped.extend(layer)
        return stopped

    async def restart(self, services: list[str] | None = None, actor: str = "user") -> None:
        await self.stop(services, actor=actor, persist=False)
        await self.start(services, actor=actor)

    def state(self) -> ProjectState:
        states = {sup.state for sup in self.supervisors.values()}
        if not states or states <= {State.STOPPED, State.COMPLETED, State.EXITED}:
            return ProjectState.STOPPED
        if states & {State.FAILED, State.UNHEALTHY, State.BLOCKED, State.BACKOFF}:
            return ProjectState.DEGRADED
        if states & {State.STARTING, State.WAITING_DEPS, State.STOPPING}:
            return ProjectState.TRANSITIONING
        return ProjectState.RUNNING

    def snapshot(self, with_stats: bool = False) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.spec.display_name,
            "description": self.spec.description,
            "autostart": self.spec.autostart,
            "state": self.state(),
            "running": sum(1 for s in self.supervisors.values() if s.state in PROCESS_UP),
            "total": len(self.supervisors),
            "services": [self.supervisors[s.id].snapshot(with_stats) for s in self.spec.services],
        }

    async def apply(self, new: ProjectSpec, restart_changed: bool, actor: str) -> dict[str, list[str]]:
        """Swap in a new config. Only touched services are (optionally) restarted."""
        old_specs = {s.id: s for s in self.spec.services}
        new_specs = {s.id: s for s in new.services}
        removed = sorted(set(old_specs) - set(new_specs))
        added = sorted(set(new_specs) - set(old_specs))
        cosmetic = {"services", "name", "description", "autostart"}
        project_level_changed = self.spec.model_dump(exclude=cosmetic) != new.model_dump(exclude=cosmetic)
        changed = sorted(
            sid for sid in set(old_specs) & set(new_specs) if old_specs[sid] != new_specs[sid] or project_level_changed
        )

        if removed:
            await self.stop(removed, actor=actor)
            for sid in removed:
                sup = self.supervisors.pop(sid)
                await sup.detach()
                await store.delete_runtime(self.id, sid)

        self.spec = new
        for sid in changed:
            self.supervisors[sid].spec = new_specs[sid]
        for sid in added:
            sup = ServiceSupervisor(self, new_specs[sid], self.engine)
            self.supervisors[sid] = sup
            sup.start_background()

        restarted = []
        if restart_changed:
            to_restart = [sid for sid in changed if self.supervisors[sid].desired == "RUNNING"]
            if to_restart:
                await self.restart(to_restart, actor=actor)
                restarted = to_restart
        self.engine.notify()
        return {"added": added, "removed": removed, "changed": changed, "restarted": restarted}


# ---------------------------------------------------------------- engine


class Engine:
    def __init__(self, platform: Platform | None = None):
        self.platform = platform or get_platform()
        self.projects: dict[str, ProjectRuntime] = {}
        self.http: httpx.AsyncClient | None = None
        self._changed = asyncio.Event()
        self._config_lock = asyncio.Lock()
        self.started_at = time.time()

    # ------------------------------------------------------------------ lifecycle
    async def start(self) -> None:
        settings.ensure_dirs()
        self.http = httpx.AsyncClient(follow_redirects=False, trust_env=False)
        self._changed = asyncio.Event()
        recorder.start()
        for spec in await project_store.load_projects():
            self._add_runtime(spec)
        await self._recover()
        recorder.record(None, None, "manager", f"service manager started (v{settings.VERSION}, {self.platform.name})")

    async def shutdown(self, stop_services: bool = False) -> None:
        if stop_services:
            for rt in self.projects.values():
                # keep desired=RUNNING so they come back with the manager
                await rt.stop(actor="system:shutdown", persist=False)
        for rt in self.projects.values():
            for sup in rt.supervisors.values():
                await sup.detach()
        recorder.record(None, None, "manager", "service manager stopped")
        await recorder.stop()
        if self.http is not None:
            await self.http.aclose()
            self.http = None

    def _add_runtime(self, spec: ProjectSpec) -> ProjectRuntime:
        rt = ProjectRuntime(spec, self)
        self.projects[spec.id] = rt
        for sup in rt.supervisors.values():
            sup.start_background()
        return rt

    async def _recover(self) -> None:
        """After (re)start: re-adopt live processes, then start what should be running."""
        boot = psutil.boot_time()
        last_boot = await store.get_system_value("boot_time")
        fresh_boot = last_boot is None or abs(float(last_boot) - boot) > 5
        await store.set_system_value("boot_time", str(boot))

        for rt in self.projects.values():
            to_start: list[str] = []
            for sup in rt.supervisors.values():
                row = await store.get_runtime(rt.id, sup.id)
                if row and row.pid:
                    handle = self.platform.adopt(row.pid, row.create_time, row.job_name)
                    if handle is not None:
                        await sup.adopt(handle, row.started_at)
                        continue
                    await store.clear_process(rt.id, sup.id)
                wants = bool(row and row.desired == "RUNNING")
                if fresh_boot and rt.spec.autostart and sup.spec.enabled:
                    wants = True
                if wants:
                    to_start.append(sup.id)
            if to_start:
                reason = "boot autostart" if fresh_boot else "restoring desired state"
                recorder.record(rt.id, None, "recover", f"{reason}: starting {', '.join(to_start)}")
                await rt.start(to_start, actor="system:recover")

    # ------------------------------------------------------------------ change notification
    def notify(self) -> None:
        ev, self._changed = self._changed, asyncio.Event()
        ev.set()

    async def wait_change(self, timeout: float) -> bool:
        ev = self._changed
        try:
            await asyncio.wait_for(ev.wait(), timeout)
            return True
        except asyncio.TimeoutError:
            return False

    # ------------------------------------------------------------------ queries
    def get(self, project_id: str) -> ProjectRuntime:
        rt = self.projects.get(project_id)
        if rt is None:
            raise NotFoundError(f"project '{project_id}' not found")
        return rt

    def get_service(self, project_id: str, service_id: str) -> ServiceSupervisor:
        sup = self.get(project_id).supervisors.get(service_id)
        if sup is None:
            raise NotFoundError(f"service '{service_id}' not found in project '{project_id}'")
        return sup

    def status(self, with_stats: bool = False) -> dict[str, Any]:
        return {
            "version": settings.VERSION,
            "platform": self.platform.name,
            "started_at": from_epoch(self.started_at),
            "projects": [self.projects[k].snapshot(with_stats) for k in sorted(self.projects)],
        }

    # ------------------------------------------------------------------ config
    async def create_project(self, spec: ProjectSpec, actor: str) -> dict[str, Any]:
        async with self._config_lock:
            if spec.id in self.projects:
                raise ConflictError(f"project '{spec.id}' already exists")
            await project_store.save_project(spec)
            self._add_runtime(spec)
            await audit(actor, "project.create", spec.id)
            self.notify()
            return {"created": True, "added": [s.id for s in spec.services]}

    async def update_project(self, spec: ProjectSpec, actor: str, restart_changed: bool = False) -> dict[str, Any]:
        async with self._config_lock:
            rt = self.get(spec.id)
            await project_store.save_project(spec)
            plan = await rt.apply(spec, restart_changed, actor)
            await audit(actor, "project.update", spec.id, detail=str(plan))
            return {"created": False, **plan}

    async def upsert_project(self, spec: ProjectSpec, actor: str, restart_changed: bool = False) -> dict[str, Any]:
        if spec.id in self.projects:
            return await self.update_project(spec, actor, restart_changed)
        return await self.create_project(spec, actor)

    async def delete_project(self, project_id: str, actor: str) -> None:
        async with self._config_lock:
            rt = self.get(project_id)
            await rt.stop(actor=actor)
            for sup in rt.supervisors.values():
                await sup.detach()
            del self.projects[project_id]
            await project_store.delete_project(project_id)
            await store.delete_runtime(project_id)
            await audit(actor, "project.delete", project_id)
            self.notify()

    # ------------------------------------------------------------------ actions
    async def project_action(self, project_id: str, action: str, services: list[str] | None, actor: str) -> dict[str, Any]:
        rt = self.get(project_id)
        target = project_id + (f"[{','.join(services)}]" if services else "")
        if action == "start":
            result = await rt.start(services, actor=actor)
        elif action == "stop":
            result = await rt.stop(services, actor=actor)
        elif action == "restart":
            await rt.restart(services, actor=actor)
            result = services or [s.id for s in rt.spec.services]
        else:
            raise ValueError(f"unknown project action '{action}'")
        await audit(actor, f"project.{action}", target)
        return {"action": action, "services": result}

    async def service_action(self, project_id: str, service_id: str, action: str, actor: str) -> dict[str, Any]:
        sup = self.get_service(project_id, service_id)
        rt = self.get(project_id)
        if action == "start":
            await rt.start([service_id], actor=actor)
        elif action == "stop":
            await sup.stop(actor=actor)
        elif action == "restart":
            await rt.restart([service_id], actor=actor)
        elif action == "kill":
            await sup.kill(actor=actor)
        elif action == "reset":
            await sup.stop(actor=actor, persist=False)
            await rt.start([service_id], actor=actor)
        else:
            raise ValueError(f"unknown service action '{action}'")
        await audit(actor, f"service.{action}", sup.key)
        return {"action": action, "service": sup.snapshot()}


# ---------------------------------------------------------------- the running instance

_engine: Engine | None = None


def set_engine(engine: Engine | None) -> None:
    global _engine
    _engine = engine


def get_engine() -> Engine:
    """FastAPI dependency / accessor for the running engine (created in main.lifespan)."""
    if _engine is None:
        raise RuntimeError("engine is not running")
    return _engine
