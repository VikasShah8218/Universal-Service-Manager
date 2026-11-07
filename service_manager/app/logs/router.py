from fastapi import APIRouter, Depends, Query

from app.logs.schemas import LogLineOut, LogsOut
from app.runtime.services import Engine, get_engine
from utilities.security import require_token

router = APIRouter(prefix="/api/v1/projects", tags=["Logs"], dependencies=[Depends(require_token)])


@router.get("/{project_id}/services/{service_id}/logs", response_model=LogsOut)
async def service_logs(
    project_id: str,
    service_id: str,
    tail: int = Query(200, ge=0, le=100_000),
    since: int | None = Query(None, ge=0, description="only lines after this seq (live follow)"),
    engine: Engine = Depends(get_engine),
):
    sup = engine.get_service(project_id, service_id)
    lines = sup.logs.since(since, limit=5000) if since is not None else sup.logs.tail(tail)
    return LogsOut(
        last_seq=sup.logs.last_seq,
        log_path=str(sup.log_path),
        lines=[LogLineOut(seq=ln.seq, ts=ln.ts, text=ln.text) for ln in lines],
    )
