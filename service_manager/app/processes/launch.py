"""Turn a Service spec into something we can actually launch.

Handles the boring-but-deadly details: env layering, .env files, ${VAR}
expansion, absolute executable resolution, Windows .cmd/.bat shims (npm!),
and Python/Node output buffering defaults.
"""

from __future__ import annotations

import os
import re
import socket
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import psutil

from app.projects.schemas import ProjectSpec, ServiceSpec
from utilities.common import IS_WINDOWS


class ResolveError(Exception):
    pass


# --------------------------------------------------------------------------- env


def norm_key(key: str) -> str:
    return key.upper() if IS_WINDOWS else key


def load_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise ResolveError(f"env file not found: {path}")
    out: dict[str, str] = {}
    for lineno, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            raise ResolveError(f"{path}:{lineno}: expected KEY=VALUE")
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        out[key] = value
    return out


_VAR = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


def expand(value: str, env: dict[str, str]) -> str:
    """Expand ${NAME} from env. Unknown names expand to ''. Use $${X} for a literal."""
    value = value.replace("$${", "\x00")
    value = _VAR.sub(lambda m: env.get(norm_key(m.group(1)), ""), value)
    return value.replace("\x00", "${")


def merge_env(base: dict[str, str], *layers: dict[str, str]) -> dict[str, str]:
    out = {norm_key(k): v for k, v in base.items()}
    for layer in layers:
        for k, v in layer.items():
            out[norm_key(k)] = expand(v, out)
    return out


# --------------------------------------------------------------------------- executables


def _pathext() -> list[str]:
    return [e.lower() for e in os.environ.get("PATHEXT", ".COM;.EXE;.BAT;.CMD").split(";") if e]


def find_executable(name: str, path_env: str | None, cwd: str) -> str | None:
    """Like shutil.which, but explicit about cwd and Windows PATHEXT handling.

    Bare names are searched on PATH only (never implicitly in cwd).
    Names with a path separator are resolved relative to cwd.
    """
    candidates_dirs: list[str]
    p = Path(name)
    if p.is_absolute() or any(sep in name for sep in ("/", "\\")):
        base = p if p.is_absolute() else Path(cwd) / p
        candidates_dirs = [str(base.parent)]
        name = base.name
    else:
        candidates_dirs = [d for d in (path_env or "").split(os.pathsep) if d]

    if IS_WINDOWS:
        exts = _pathext()
        has_ext = Path(name).suffix.lower() in exts
        names = [name] if has_ext else [name + e for e in exts]
    else:
        names = [name]

    for d in candidates_dirs:
        for n in names:
            full = os.path.join(d, n)
            if os.path.isfile(full) and (IS_WINDOWS or os.access(full, os.X_OK)):
                return os.path.normpath(full)
    return None


def _quote_for_cmd(args: list[str]) -> str:
    return subprocess.list2cmdline(args)


def _windows_shim(path: str, args: list[str], env: dict[str, str], cwd: str) -> list[str] | str:
    """`.cmd`/`.bat` files can't be executed directly by CreateProcess."""
    p = Path(path)
    stem = p.stem.lower()
    if stem in ("npm", "npx"):
        cli = p.parent / "node_modules" / "npm" / "bin" / f"{stem}-cli.js"
        if cli.is_file():
            node = p.parent / "node.exe"
            node_path = str(node) if node.is_file() else find_executable("node", env.get("PATH"), cwd)
            if node_path:
                # run npm without cmd.exe: no "Terminate batch job (Y/N)?" and clean Ctrl+C
                return [node_path, str(cli), *args]
    # cmd /d /s /c ""C:\path with space\tool.cmd" arg1 arg2"
    return f'cmd.exe /d /s /c "{_quote_for_cmd([path, *args])}"'


# --------------------------------------------------------------------------- launch plan


@dataclass
class LaunchPlan:
    argv: list[str] | str
    cwd: str
    env: dict[str, str]
    display: str


DEFAULT_CHILD_ENV = {
    "PYTHONUNBUFFERED": "1",  # otherwise Python logs show up late (or never)
    "PYTHONIOENCODING": "utf-8",
}


def resolve_dir(value: str | None, base: str | None) -> str | None:
    if not value:
        return base
    p = Path(value)
    if not p.is_absolute():
        if not base:
            raise ResolveError(f"relative path '{value}' needs an absolute project cwd")
        p = Path(base) / p
    return str(p.resolve())


def build_launch(project: ProjectSpec, service: ServiceSpec, base_env: dict[str, str] | None = None) -> LaunchPlan:
    project_dir = resolve_dir(project.cwd, None)
    cwd = resolve_dir(service.cwd, project_dir)
    if not cwd:
        raise ResolveError(f"service '{service.id}' has no cwd (set service.cwd or project.cwd)")
    if not Path(cwd).is_dir():
        raise ResolveError(f"working directory does not exist: {cwd}")

    builtins = {
        "USM_PROJECT": project.id,
        "USM_SERVICE": service.id,
        "USM_PROJECT_DIR": project_dir or cwd,
        "USM_SERVICE_DIR": cwd,
    }
    base = dict(os.environ if base_env is None else base_env)
    base_keys = {norm_key(k) for k in base}
    # defaults never override what the user's own environment already says
    defaults = {k: v for k, v in DEFAULT_CHILD_ENV.items() if norm_key(k) not in base_keys}

    layers: list[dict[str, str]] = [defaults, builtins]
    if project.env_file:
        layers.append(load_env_file(Path(resolve_dir(project.env_file, project_dir or cwd))))
    layers.append(project.env)
    if service.env_file:
        layers.append(load_env_file(Path(resolve_dir(service.env_file, cwd))))
    layers.append(service.env)
    env = merge_env(base, *layers)

    if service.shell:
        cmd = service.command if isinstance(service.command, str) else _quote_for_cmd(service.command)
        cmd = expand(cmd, env)
        if IS_WINDOWS:
            return LaunchPlan(f'cmd.exe /d /s /c "{cmd}"', cwd, env, cmd)
        return LaunchPlan(["/bin/sh", "-c", cmd], cwd, env, cmd)

    args = [expand(a, env) for a in service.command]  # type: ignore[union-attr]
    exe = find_executable(args[0], env.get(norm_key("PATH")), cwd)
    if exe is None:
        raise ResolveError(
            f"executable not found: '{args[0]}' (not on the service manager's PATH; use an absolute path)"
        )
    display = _quote_for_cmd([exe, *args[1:]])
    if IS_WINDOWS and Path(exe).suffix.lower() in (".cmd", ".bat"):
        return LaunchPlan(_windows_shim(exe, args[1:], env, cwd), cwd, env, display)
    return LaunchPlan([exe, *args[1:]], cwd, env, display)


# --------------------------------------------------------------------------- ports

LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "0.0.0.0", "::", ""}


def service_local_ports(service: ServiceSpec) -> set[int]:
    ports: set[int] = set()
    probes = ([service.readiness] if service.readiness else []) + list(service.health_checks)
    for p in probes:
        if p.type == "tcp" and p.host in LOCAL_HOSTS:
            ports.add(p.port)
        elif p.type == "http":
            u = urlparse(p.url)
            if (u.hostname or "") in LOCAL_HOSTS:
                ports.add(u.port or (443 if u.scheme == "https" else 80))
    return ports


def port_owner(port: int) -> dict | None:
    """Who is listening on a local TCP port? None if the port is free."""
    try:
        for c in psutil.net_connections(kind="tcp"):
            if c.status == psutil.CONN_LISTEN and c.laddr and c.laddr.port == port:
                name = None
                if c.pid:
                    try:
                        name = psutil.Process(c.pid).name()
                    except psutil.Error:
                        pass
                return {"port": port, "pid": c.pid, "name": name}
        return None
    except (psutil.AccessDenied, PermissionError, OSError):
        pass
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        if s.connect_ex(("127.0.0.1", port)) == 0:
            return {"port": port, "pid": None, "name": None}
    return None
