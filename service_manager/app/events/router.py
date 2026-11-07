from fastapi import APIRouter, Depends, Query

from app.events.schemas import AuditOut, EventOut
from app.events.services import list_audit, list_events
from utilities.security import require_token

router = APIRouter(prefix="/api/v1", tags=["Events"], dependencies=[Depends(require_token)])


@router.get("/events", response_model=list[EventOut])
async def get_events(
    project: str | None = None,
    service: str | None = None,
    limit: int = Query(100, ge=1, le=5000),
):
    """State changes, starts, crashes, restarts and errors (oldest first)."""
    return [EventOut.model_validate(e, from_attributes=True) for e in await list_events(project, service, limit)]


@router.get("/audit", response_model=list[AuditOut])
async def get_audit(limit: int = Query(100, ge=1, le=5000)):
    """Who changed config or started/stopped what (oldest first)."""
    return [AuditOut.model_validate(a, from_attributes=True) for a in await list_audit(limit)]
