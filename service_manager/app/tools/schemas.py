from typing import Any

from pydantic import BaseModel


class ResolveExeIn(BaseModel):
    name: str
    cwd: str | None = None


class ResolveExeOut(BaseModel):
    name: str
    path: str | None  # None = not found


class CheckPortIn(BaseModel):
    port: int


class PortOwner(BaseModel):
    port: int
    pid: int | None
    name: str | None


class CheckPortOut(BaseModel):
    port: int
    in_use: bool
    owner: PortOwner | None


class DetectIn(BaseModel):
    base: str | None = None  # project cwd
    cwd: str | None = None  # service cwd (relative to base, or absolute)


class CommandSuggestion(BaseModel):
    label: str
    note: str
    command: list[str]
    readiness: dict[str, Any] | None


class DetectOut(BaseModel):
    path: str | None
    exists: bool
    suggestions: list[CommandSuggestion]


class DirEntry(BaseModel):
    name: str
    path: str


class DirListingOut(BaseModel):
    path: str  # "" = drive list (Windows) / root
    parent: str | None
    home: str
    dirs: list[DirEntry]
