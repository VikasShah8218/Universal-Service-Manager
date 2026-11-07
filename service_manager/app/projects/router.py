from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from app.projects.schemas import ApplyResultOut, ProjectSpec
from app.projects.utils import parse_project_yaml, project_to_yaml
from app.runtime.schemas import ProjectStatusOut
from app.runtime.services import Engine, get_engine
from utilities.security import actor, require_token

router = APIRouter(prefix="/api/v1/projects", tags=["Projects"], dependencies=[Depends(require_token)])


class ProjectDetailOut(BaseModel):
    spec: ProjectSpec
    status: ProjectStatusOut


@router.get("", response_model=list[ProjectStatusOut])
async def list_projects(engine: Engine = Depends(get_engine)):
    return [engine.projects[k].snapshot() for k in sorted(engine.projects)]


@router.post("", response_model=ApplyResultOut, status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectSpec, request: Request, engine: Engine = Depends(get_engine)):
    return await engine.create_project(body, actor(request))


@router.post("/import", response_model=ApplyResultOut)
async def import_project(request: Request, restart_changed: bool = False, engine: Engine = Depends(get_engine)):
    """Create or update a project from a YAML body (same shape as `export`)."""
    spec = parse_project_yaml((await request.body()).decode("utf-8"))
    return await engine.upsert_project(spec, actor(request), restart_changed)


@router.get("/{project_id}", response_model=ProjectDetailOut)
async def get_project(project_id: str, engine: Engine = Depends(get_engine)):
    rt = engine.get(project_id)
    return {"spec": rt.spec, "status": rt.snapshot()}


@router.put("/{project_id}", response_model=ApplyResultOut)
async def update_project(
    project_id: str, body: ProjectSpec, request: Request, restart_changed: bool = False,
    engine: Engine = Depends(get_engine),
):
    """Replace the project's config. `restart_changed=true` restarts running services whose config changed."""
    if body.id != project_id:
        raise HTTPException(422, "project id in body does not match URL")
    return await engine.update_project(body, actor(request), restart_changed)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: str, request: Request, engine: Engine = Depends(get_engine)):
    """Stops all of the project's services, then deletes it."""
    await engine.delete_project(project_id, actor(request))


@router.get("/{project_id}/export", response_class=PlainTextResponse)
async def export_project(project_id: str, engine: Engine = Depends(get_engine)):
    return project_to_yaml(engine.get(project_id).spec)
