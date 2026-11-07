"""Universal Service Manager (USM): starts, watches and restarts your services.

Run:  py main.py
Docs: http://127.0.0.1:7420/docs   (API token: data/token)

Services keep running when this process exits; on the next start they are
re-adopted (unless STOP_SERVICES_ON_EXIT=true).
"""

import asyncio
import logging
import logging.handlers
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from tortoise.contrib.fastapi import RegisterTortoise

from app.events.router import router as events_router
from app.logs.router import router as logs_router
from app.projects.router import router as projects_router
from app.runtime.router import router as runtime_router
from app.runtime.services import Engine, set_engine
from app.tools.router import router as tools_router
from database.config import TORTOISE_ORM
from settings.settings import settings
from utilities.common import ConflictError, NotFoundError
from utilities.instance import AlreadyRunning, SingleInstance, Watchdog
from utilities.security import LoopbackGuard, set_token

logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
logger = logging.getLogger("usm")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    set_token(settings.read_or_create_token())
    async with RegisterTortoise(app, config=TORTOISE_ORM, generate_schemas=settings.db_url.startswith("sqlite")):
        engine = Engine()
        await engine.start()
        set_engine(engine)
        watchdog = Watchdog(settings.WATCHDOG_STALL_SECONDS)
        watchdog.start_thread()
        heartbeat = asyncio.create_task(watchdog.heartbeat(), name="watchdog-heartbeat")
        logger.info("%s v%s started on %s (data: %s)", settings.APP_NAME, settings.VERSION, settings.base_url,
                    settings.DATA_DIR)
        try:
            yield
        finally:
            heartbeat.cancel()
            logger.info("shutting down (stop services: %s)", settings.STOP_SERVICES_ON_EXIT)
            await engine.shutdown(stop_services=settings.STOP_SERVICES_ON_EXIT)
            set_engine(None)


app = FastAPI(title=settings.APP_NAME, version=settings.VERSION, lifespan=lifespan)
app.add_middleware(LoopbackGuard)

for r in (
    projects_router,
    runtime_router,
    logs_router,
    events_router,
    tools_router,
):
    app.include_router(r)


@app.exception_handler(NotFoundError)
async def not_found(_: Request, exc: NotFoundError):
    return JSONResponse({"detail": str(exc)}, status_code=status.HTTP_404_NOT_FOUND)


@app.exception_handler(ConflictError)
async def conflict(_: Request, exc: ConflictError):
    return JSONResponse({"detail": str(exc)}, status_code=status.HTTP_409_CONFLICT)


@app.get("/", tags=["System"])
async def root():
    return {"service": settings.APP_NAME, "version": settings.VERSION, "docs": "/docs"}


@app.get("/api/v1/health", tags=["System"])
async def health():
    """Public liveness check (no token)."""
    return {"ok": True, "version": settings.VERSION}


def add_file_logging() -> None:
    handler = logging.handlers.RotatingFileHandler(
        settings.manager_log_path, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s"))
    logging.getLogger().addHandler(handler)


if __name__ == "__main__":
    settings.ensure_dirs()
    add_file_logging()
    try:
        instance = SingleInstance(settings)  # keep a reference: releasing it frees the lock
        instance.acquire()
    except AlreadyRunning as e:
        logger.error("%s", e)
        sys.exit(2)
    uvicorn.run(app, host=settings.HOST, port=settings.PORT, log_level=settings.LOG_LEVEL.lower())
