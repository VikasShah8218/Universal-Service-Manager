"""API protection. This API can run arbitrary commands, so:

* it binds to 127.0.0.1 only (settings.HOST),
* every /api/v1 request (except /api/v1/health) needs the token from DATA_DIR/token,
* the Host header must be a loopback name (blocks DNS-rebinding attacks),
* a browser Origin, if present, must be a loopback origin (blocks CSRF).
"""

import secrets
from urllib.parse import urlparse

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from settings.settings import settings

LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "[::1]", "::1"}
LOOPBACK_ORIGIN_HOSTS = {"127.0.0.1", "localhost", "::1"}

_token: str | None = None


def set_token(token: str) -> None:
    global _token
    _token = token


def get_token() -> str:
    global _token
    if _token is None:
        _token = settings.read_or_create_token()
    return _token


def host_name(host_header: str) -> str:
    """'127.0.0.1:7420' -> '127.0.0.1', '[::1]:7420' -> '[::1]'."""
    if host_header.startswith("["):
        return host_header.split("]", 1)[0] + "]"
    return host_header.rsplit(":", 1)[0]


class LoopbackGuard(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if host_name(request.headers.get("host", "")) not in LOOPBACK_HOSTS:
            return JSONResponse({"detail": "forbidden host"}, status_code=status.HTTP_403_FORBIDDEN)
        origin = request.headers.get("origin")
        if origin and urlparse(origin).hostname not in LOOPBACK_ORIGIN_HOSTS:
            return JSONResponse({"detail": "forbidden origin"}, status_code=status.HTTP_403_FORBIDDEN)
        return await call_next(request)


async def require_token(request: Request) -> None:
    supplied = request.headers.get("x-usm-token")
    auth = request.headers.get("authorization", "")
    if not supplied and auth.lower().startswith("bearer "):
        supplied = auth[7:].strip()
    if not supplied or not secrets.compare_digest(supplied, get_token()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing or invalid token")


def actor(request: Request) -> str:
    """Who did it (for audit/events): X-USM-Client header, e.g. 'cli' or 'ui'."""
    return request.headers.get("x-usm-client", "api")[:40]
