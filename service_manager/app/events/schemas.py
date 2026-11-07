from datetime import datetime
from typing import Any

from pydantic import BaseModel


class EventOut(BaseModel):
    id: int
    ts: datetime
    project_id: str | None
    service_id: str | None
    kind: str
    message: str
    data: dict[str, Any] | None


class AuditOut(BaseModel):
    id: int
    ts: datetime
    actor: str
    action: str
    target: str
    outcome: str
    detail: str | None
