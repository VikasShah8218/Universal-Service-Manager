import asyncio

from fastapi import APIRouter, Depends, HTTPException, status

from app.tools.schemas import (
    CheckPortIn,
    CheckPortOut,
    DetectIn,
    DetectOut,
    DirListingOut,
    ResolveExeIn,
    ResolveExeOut,
)
from app.tools.services import detect_commands, list_dir, port_owner, resolve_executable
from utilities.security import require_token

router = APIRouter(prefix="/api/v1/tools", tags=["Tools"], dependencies=[Depends(require_token)])


@router.post("/resolve-exe", response_model=ResolveExeOut)
async def resolve_exe(body: ResolveExeIn):
    """Where would the manager find this executable?"""
    return {"name": body.name, "path": resolve_executable(body.name, body.cwd)}


@router.post("/check-port", response_model=CheckPortOut)
async def check_port(body: CheckPortIn):
    """Is this local TCP port in use, and by which process?"""
    owner = await asyncio.to_thread(port_owner, body.port)
    return {"port": body.port, "in_use": owner is not None, "owner": owner}


@router.get("/list-dir", response_model=DirListingOut)
async def get_list_dir(path: str | None = None):
    """Sub-folders of an absolute path (folder picker). No path = drives / root."""
    try:
        return await asyncio.to_thread(list_dir, path)
    except FileNotFoundError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
    except (ValueError, PermissionError) as e:
        raise HTTPException(422, str(e)) from e


@router.post("/detect", response_model=DetectOut)
async def detect(body: DetectIn):
    """Suggest start commands for a service folder (venv python, npm scripts, cargo, go)."""
    return await asyncio.to_thread(detect_commands, body.base, body.cwd)
