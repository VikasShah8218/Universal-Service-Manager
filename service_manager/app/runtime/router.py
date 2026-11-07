import asyncio

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.projects.schemas import ServiceSpec
from app.runtime.schemas import (
    ProjectActionIn,
    ProjectActionOut,
    ServiceActionIn,
    ServiceActionOut,
    ServiceStatusOut,
    SystemStatusOut,
)
from app.runtime.services import Engine, get_engine
from utilities.security import actor, require_token

router = APIRouter(prefix="/api/v1", tags=["Runtime"], dependencies=[Depends(require_token)])


class ServiceDetailOut(BaseModel):
    spec: ServiceSpec
    status: ServiceStatusOut


@router.get("/status", response_model=SystemStatusOut)
async def get_status(stats: bool = False, engine: Engine = Depends(get_engine)):
    """Every project and service with its live state. `stats=true` adds CPU/RAM (whole process tree)."""
    if stats:
        return await asyncio.to_thread(engine.status, True)
    return engine.status()


@router.post("/projects/{project_id}/actions", response_model=ProjectActionOut)
async def project_action(project_id: str, body: ProjectActionIn, request: Request, engine: Engine = Depends(get_engine)):
    """Start / stop / restart a project, or some of its services (dependencies are handled)."""
    return await engine.project_action(project_id, body.action, body.services, actor(request))


@router.get("/projects/{project_id}/services/{service_id}", response_model=ServiceDetailOut)
async def get_service(project_id: str, service_id: str, engine: Engine = Depends(get_engine)):
    sup = engine.get_service(project_id, service_id)
    return {"spec": sup.spec, "status": await asyncio.to_thread(sup.snapshot, True)}


@router.post("/projects/{project_id}/services/{service_id}/actions", response_model=ServiceActionOut)
async def service_action(
    project_id: str, service_id: str, body: ServiceActionIn, request: Request, engine: Engine = Depends(get_engine)
):
    """start / stop / restart / kill (hard, restart policy applies) / reset (clear FAILED and start)."""
    return await engine.service_action(project_id, service_id, body.action, actor(request))
