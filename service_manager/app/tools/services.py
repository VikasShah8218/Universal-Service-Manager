"""Helpers for the config UI: a folder browser and command detection.

A browser cannot see local paths, so the manager (which runs as the same
user, on the same machine) lists folders and inspects a service folder to
suggest a start command (venv python, npm scripts, ...).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import psutil

from app.processes.launch import find_executable, port_owner
from utilities.common import IS_WINDOWS

MAX_DIRS = 2000
PY_ENTRYPOINTS = ("main.py", "app.py", "run.py", "server.py", "manage.py")
VENV_DIRS = (".venv", "venv", "env")
VITE_READY = {"type": "log_regex", "pattern": r"Local:\s+http", "timeout_s": 60}


def _roots() -> list[dict[str, str]]:
    if not IS_WINDOWS:
        return [{"name": "/", "path": "/"}]
    roots = []
    for part in psutil.disk_partitions(all=False):
        roots.append({"name": part.mountpoint, "path": part.mountpoint})
    return roots


def list_dir(path: str | None) -> dict[str, Any]:
    """Sub-folders of `path`. Empty path -> the drive list (Windows) or '/'."""
    home = str(Path.home())
    if not path:
        return {"path": "", "parent": None, "home": home, "dirs": _roots()}
    p = Path(path).expanduser()
    if not p.is_absolute():
        raise ValueError("path must be absolute")
    if not p.is_dir():
        raise FileNotFoundError(f"folder not found: {p}")
    dirs = []
    try:
        with os.scandir(p) as it:
            for entry in it:
                try:
                    if entry.is_dir():
                        dirs.append({"name": entry.name, "path": str(p / entry.name)})
                except OSError:
                    continue
                if len(dirs) >= MAX_DIRS:
                    break
    except PermissionError as e:
        raise PermissionError(f"access denied: {p}") from e
    dirs.sort(key=lambda d: d["name"].lower())
    parent = p.parent
    return {
        "path": str(p),
        "parent": "" if parent == p else str(parent),  # "" = drive list / root
        "home": home,
        "dirs": dirs,
    }


def _resolve(base: str | None, cwd: str | None) -> Path | None:
    root = Path(base).expanduser() if base else None
    sub = Path(cwd).expanduser() if cwd else None
    if sub is None:
        return root
    if sub.is_absolute() or root is None:
        return sub
    return root / sub


def _venv_python(folder: Path) -> str | None:
    for venv in VENV_DIRS:
        for rel in (("Scripts", "python.exe"), ("bin", "python")):
            if (folder / venv).joinpath(*rel).is_file():
                return "/".join((venv, *rel))
    return None


def detect_commands(base: str | None, cwd: str | None) -> dict[str, Any]:
    """Suggest start commands for a service folder."""
    folder = _resolve(base, cwd)
    if folder is None:
        return {"path": None, "exists": False, "suggestions": []}
    if not folder.is_dir():
        return {"path": str(folder), "exists": False, "suggestions": []}

    out: list[dict[str, Any]] = []
    py = _venv_python(folder)
    for name in PY_ENTRYPOINTS:
        if not (folder / name).is_file():
            continue
        exe = py or ("py" if IS_WINDOWS else "python3")
        cmd = [exe, name] + (["runserver", "--noreload"] if name == "manage.py" else [])
        note = f"venv: {py.split('/')[0]}" if py else "no venv found, uses system Python"
        out.append({"label": " ".join(cmd), "note": note, "command": cmd, "readiness": None})

    pkg = folder / "package.json"
    if pkg.is_file():
        try:
            data = json.loads(pkg.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
        scripts = data.get("scripts") or {}
        deps = {**(data.get("dependencies") or {}), **(data.get("devDependencies") or {})}
        runner = "pnpm" if (folder / "pnpm-lock.yaml").exists() else "yarn" if (folder / "yarn.lock").exists() else "npm"
        if not (folder / "node_modules").is_dir():
            note_extra = " - node_modules missing, run install first"
        else:
            note_extra = ""
        preferred = ("dev", "start", "serve", "preview")
        for name in sorted(scripts, key=lambda s: (s not in preferred, preferred.index(s) if s in preferred else 0, s))[:8]:
            body = str(scripts[name])
            ready = VITE_READY if ("vite" in body or ("vite" in deps and name in ("dev", "serve", "preview"))) else None
            out.append({
                "label": f"{runner} run {name}",
                "note": (body[:80] + note_extra),
                "command": [runner, "run", name],
                "readiness": ready,
            })

    if (folder / "Cargo.toml").is_file():
        out.append({"label": "cargo run", "note": "Rust", "command": ["cargo", "run"], "readiness": None})
    if (folder / "go.mod").is_file():
        out.append({"label": "go run .", "note": "Go", "command": ["go", "run", "."], "readiness": None})

    return {"path": str(folder), "exists": True, "suggestions": out}


def resolve_executable(name: str, cwd: str | None) -> str | None:
    """Where the manager would find `name` (same rules as when starting a service)."""
    return find_executable(name, os.environ.get("PATH"), cwd or os.getcwd())


__all__ = ["detect_commands", "list_dir", "port_owner", "resolve_executable"]
