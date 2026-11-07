"""Event log and audit trail.

Supervisors record events from synchronous code paths (every state change),
so `recorder.record()` only queues the event; one background task writes the
queue to the database in batches and prunes old rows.
"""

import asyncio
import logging

from app.events.models import AuditLog, Event
from settings.settings import settings
from utilities.common import utcnow

logger = logging.getLogger("usm.events")

PRUNE_EVERY = 1000
MAX_BATCH = 500


class EventRecorder:
    def __init__(self) -> None:
        self._queue: asyncio.Queue | None = None
        self._task: asyncio.Task | None = None
        self._since_prune = 0

    def start(self) -> None:
        self._queue = asyncio.Queue()
        self._since_prune = 0
        self._task = asyncio.create_task(self._run(), name="event-writer")

    async def stop(self) -> None:
        await self.flush()
        if self._task is not None:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
        self._task = None
        self._queue = None

    def record(
        self, project_id: str | None, service_id: str | None, kind: str, message: str, data: dict | None = None
    ) -> None:
        if self._queue is None:  # not started (e.g. during shutdown): keep it in the manager log
            logger.info("[event %s/%s] %s: %s", project_id, service_id, kind, message)
            return
        self._queue.put_nowait(
            Event(ts=utcnow(), project_id=project_id, service_id=service_id, kind=kind[:32], message=message,
                  data=data)
        )

    async def flush(self) -> None:
        """Wait until everything recorded so far is in the database."""
        if self._queue is not None and self._task is not None and not self._task.done():
            await self._queue.join()

    async def _run(self) -> None:
        assert self._queue is not None
        q = self._queue
        while True:
            batch = [await q.get()]
            while not q.empty() and len(batch) < MAX_BATCH:
                batch.append(q.get_nowait())
            try:
                await Event.bulk_create(batch)
                self._since_prune += len(batch)
                if self._since_prune >= PRUNE_EVERY:
                    self._since_prune = 0
                    await prune_events(settings.EVENTS_KEEP)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("could not write %d event(s)", len(batch))
            finally:
                for _ in batch:
                    q.task_done()


recorder = EventRecorder()


async def prune_events(keep: int) -> None:
    newest = await Event.all().order_by("-id").first()
    if newest is not None and newest.id > keep:
        await Event.filter(id__lte=newest.id - keep).delete()


async def audit(actor: str, action: str, target: str, outcome: str = "ok", detail: str | None = None) -> None:
    await AuditLog.create(actor=actor[:64], action=action, target=target[:256], outcome=outcome, detail=detail)


async def list_events(project_id: str | None = None, service_id: str | None = None, limit: int = 100) -> list[Event]:
    await recorder.flush()
    qs = Event.all()
    if project_id:
        qs = qs.filter(project_id=project_id)
    if service_id:
        qs = qs.filter(service_id=service_id)
    rows = await qs.order_by("-id").limit(max(1, min(limit, 5000)))
    return list(reversed(rows))


async def list_audit(limit: int = 100) -> list[AuditLog]:
    rows = await AuditLog.all().order_by("-id").limit(max(1, min(limit, 5000)))
    return list(reversed(rows))
