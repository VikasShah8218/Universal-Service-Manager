"""`usm` command line: talk to the running service manager over its local API.

Run:  py cli.py status      (or usm.cmd status)
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx
import yaml

from settings.settings import Settings, settings as app_settings

STATE_COLORS = {
    "HEALTHY": "32", "RUNNING": "32", "COMPLETED": "32",
    "STARTING": "36", "WAITING_DEPS": "36", "TRANSITIONING": "36", "STOPPING": "36",
    "UNHEALTHY": "33", "BACKOFF": "33", "DEGRADED": "33", "BLOCKED": "33",
    "FAILED": "31",
    "STOPPED": "90", "EXITED": "90",
}


class CliError(Exception):
    pass


def color(text: str, state: str) -> str:
    if not sys.stdout.isatty():
        return text
    code = STATE_COLORS.get(state)
    return f"\033[{code}m{text}\033[0m" if code else text


def fmt_uptime(sec: float | None) -> str:
    if sec is None:
        return "-"
    sec = int(sec)
    d, rem = divmod(sec, 86400)
    h, rem = divmod(rem, 3600)
    m, s = divmod(rem, 60)
    if d:
        return f"{d}d{h}h"
    if h:
        return f"{h}h{m}m"
    if m:
        return f"{m}m{s}s"
    return f"{s}s"


class Client:
    def __init__(self, settings: Settings):
        self.settings = settings
        token = settings.read_token()
        if not token:
            raise CliError(f"no token at {settings.token_path}. Is the service manager started? (run: py main.py)")
        self.http = httpx.Client(
            base_url=settings.base_url,
            headers={"X-USM-Token": token, "X-USM-Client": "cli"},
            timeout=60,
            trust_env=False,
        )

    def request(self, method: str, path: str, **kw):
        try:
            r = self.http.request(method, path, **kw)
        except httpx.ConnectError:
            raise CliError(f"cannot reach the service manager at {self.settings.base_url} (start it with: py main.py)") from None
        if r.status_code >= 400:
            try:
                detail = r.json().get("detail")
            except ValueError:
                detail = r.text
            if isinstance(detail, list):
                detail = "\n".join(f"  - {'.'.join(map(str, d.get('loc', [])))}: {d.get('msg')}" for d in detail)
                detail = "validation failed:\n" + detail
            raise CliError(f"{detail} (HTTP {r.status_code})")
        if r.status_code == 204:
            return None
        ctype = r.headers.get("content-type", "")
        return r.json() if "json" in ctype else r.text


# --------------------------------------------------------------------------- commands


def print_status(projects: list[dict]) -> None:
    if not projects:
        print("no projects. Import one with: usm import <project.yaml>")
        return
    rows = [("PROJECT", "SERVICE", "STATE", "PID", "UPTIME", "RESTARTS", "MESSAGE")]
    states = []
    for p in projects:
        rows.append((p["id"], "", p["state"], "", "", "", f"{p['running']}/{p['total']} running"))
        states.append(p["state"])
        for s in p["services"]:
            rows.append(("", s["id"], s["state"], str(s["pid"] or "-"), fmt_uptime(s["uptime_s"]),
                         str(s["restart_count"]), (s["message"] or "")[:80]))
            states.append(s["state"])
    widths = [max(len(r[i]) for r in rows) for i in range(6)]
    for idx, r in enumerate(rows):
        cells = [r[i].ljust(widths[i]) for i in range(6)]
        if idx > 0:
            cells[2] = color(cells[2], states[idx - 1])
        print("  ".join(cells) + "  " + r[6])


def cmd_status(c: Client, a) -> None:
    data = c.request("GET", "/api/v1/status")
    projects = data["projects"]
    if a.project:
        projects = [p for p in projects if p["id"] == a.project]
        if not projects:
            raise CliError(f"project '{a.project}' not found")
    print_status(projects)


def cmd_import(c: Client, a) -> None:
    path = Path(a.file).resolve()
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise CliError("YAML must describe one project (a mapping)")
    # relative project cwd is relative to the YAML file's folder
    cwd = data.get("cwd")
    if not cwd or not Path(cwd).is_absolute():
        data["cwd"] = str((path.parent / (cwd or ".")).resolve())
    res = c.request("POST", "/api/v1/projects/import", params={"restart_changed": a.restart},
                    content=yaml.safe_dump(data, sort_keys=False).encode("utf-8"))
    verb = "created" if res.get("created") else "updated"
    print(f"project '{data.get('id')}' {verb}")
    for k in ("added", "changed", "removed", "restarted"):
        if res.get(k):
            print(f"  {k}: {', '.join(res[k])}")
    if not res.get("created") and res.get("changed") and not a.restart:
        print("  (running services keep the old config until restarted; use --restart to apply now)")


def cmd_export(c: Client, a) -> None:
    text = c.request("GET", f"/api/v1/projects/{a.project}/export")
    if a.output:
        Path(a.output).write_text(text, encoding="utf-8")
        print(f"written {a.output}")
    else:
        print(text, end="")


def cmd_ls(c: Client, a) -> None:
    for p in c.request("GET", "/api/v1/projects"):
        print(f"{p['id']:<24} {color(p['state'], p['state']):<14} {p['running']}/{p['total']} running"
              + ("  [autostart]" if p["autostart"] else ""))


def _project_action(c: Client, project: str, action: str, services: list[str]) -> None:
    res = c.request("POST", f"/api/v1/projects/{project}/actions",
                    json={"action": action, "services": services or None})
    print(f"{action}: {', '.join(res['services']) or '(nothing)'}")


def cmd_up(c, a):
    _project_action(c, a.project, "start", a.services)
    if a.wait:
        wait_settled(c, a.project, a.wait)


def cmd_down(c, a):
    _project_action(c, a.project, "stop", a.services)


def cmd_restart(c, a):
    _project_action(c, a.project, "restart", a.services)


def cmd_kill(c, a):
    c.request("POST", f"/api/v1/projects/{a.project}/services/{a.service}/actions", json={"action": "kill"})
    print(f"killed {a.project}/{a.service}")


def cmd_reset(c, a):
    c.request("POST", f"/api/v1/projects/{a.project}/services/{a.service}/actions", json={"action": "reset"})
    print(f"reset {a.project}/{a.service}")


def wait_settled(c: Client, project: str, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        p = c.request("GET", f"/api/v1/projects/{project}")["status"]
        if p["state"] in ("RUNNING", "DEGRADED", "STOPPED") and not any(
            s["state"] in ("STARTING", "WAITING_DEPS") for s in p["services"]
        ):
            break
        time.sleep(0.5)
    print_status([c.request("GET", f"/api/v1/projects/{project}")["status"]])


def cmd_logs(c: Client, a) -> None:
    base = f"/api/v1/projects/{a.project}/services/{a.service}/logs"
    res = c.request("GET", base, params={"tail": a.lines})
    for ln in res["lines"]:
        print(ln["text"])
    if not a.follow:
        return
    seq = res["last_seq"]
    try:
        while True:
            time.sleep(0.5)
            res = c.request("GET", base, params={"since": seq})
            for ln in res["lines"]:
                print(ln["text"], flush=True)
            if res["lines"]:
                seq = res["lines"][-1]["seq"]
            elif res["last_seq"] < seq:  # manager restarted
                seq = 0
    except KeyboardInterrupt:
        pass


def cmd_events(c: Client, a) -> None:
    params = {"limit": a.lines}
    if a.project:
        params["project"] = a.project
    if a.service:
        params["service"] = a.service
    for e in c.request("GET", "/api/v1/events", params=params):
        ts = datetime.fromisoformat(e["ts"]).astimezone().strftime("%Y-%m-%d %H:%M:%S")
        target = "/".join(x for x in (e["project_id"], e["service_id"]) if x) or "manager"
        print(f"{ts}  {target:<32} {e['kind']:<16} {e['message']}")


def cmd_rm(c: Client, a) -> None:
    if not a.yes:
        ans = input(f"delete project '{a.project}' (its services will be stopped)? [y/N] ")
        if ans.strip().lower() != "y":
            print("aborted")
            return
    c.request("DELETE", f"/api/v1/projects/{a.project}")
    print(f"project '{a.project}' deleted")


def cmd_resolve(c: Client, a) -> None:
    res = c.request("POST", "/api/v1/tools/resolve-exe", json={"name": a.name})
    print(res["path"] or f"'{a.name}' not found on the service manager's PATH")


def cmd_port(c: Client, a) -> None:
    res = c.request("POST", "/api/v1/tools/check-port", json={"port": a.port})
    if not res["in_use"]:
        print(f"port {a.port} is free")
    else:
        o = res["owner"]
        print(f"port {a.port} is in use by pid {o['pid'] or '?'} ({o['name'] or 'unknown'})")


# --------------------------------------------------------------------------- parser


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="usm", description="Universal Service Manager")
    p.add_argument("--version", action="version", version=f"usm {app_settings.VERSION}")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("status", help="show projects and services")
    s.add_argument("project", nargs="?")
    s.set_defaults(fn=cmd_status)

    s = sub.add_parser("ls", help="list projects")
    s.set_defaults(fn=cmd_ls)

    s = sub.add_parser("import", help="create/update a project from a YAML file")
    s.add_argument("file")
    s.add_argument("--restart", action="store_true", help="restart running services whose config changed")
    s.set_defaults(fn=cmd_import)

    s = sub.add_parser("export", help="print a project as YAML")
    s.add_argument("project")
    s.add_argument("-o", "--output")
    s.set_defaults(fn=cmd_export)

    for name, fn, helptext in (("up", cmd_up, "start a project (or some of its services)"),
                               ("down", cmd_down, "stop a project (or some of its services)"),
                               ("restart", cmd_restart, "restart a project (or some of its services)")):
        s = sub.add_parser(name, help=helptext)
        s.add_argument("project")
        s.add_argument("services", nargs="*")
        if name == "up":
            s.add_argument("--wait", type=float, nargs="?", const=60.0, default=None,
                           help="wait until services settle, then print status (default 60s)")
        s.set_defaults(fn=fn)

    for name, fn, helptext in (("kill", cmd_kill, "hard-kill a service tree (restart policy applies)"),
                               ("reset", cmd_reset, "clear FAILED state and start again")):
        s = sub.add_parser(name, help=helptext)
        s.add_argument("project")
        s.add_argument("service")
        s.set_defaults(fn=fn)

    s = sub.add_parser("logs", help="show service logs")
    s.add_argument("project")
    s.add_argument("service")
    s.add_argument("-n", "--lines", type=int, default=200)
    s.add_argument("-f", "--follow", action="store_true")
    s.set_defaults(fn=cmd_logs)

    s = sub.add_parser("events", help="show recent events")
    s.add_argument("project", nargs="?")
    s.add_argument("service", nargs="?")
    s.add_argument("-n", "--lines", type=int, default=50)
    s.set_defaults(fn=cmd_events)

    s = sub.add_parser("rm", help="delete a project")
    s.add_argument("project")
    s.add_argument("-y", "--yes", action="store_true")
    s.set_defaults(fn=cmd_rm)

    s = sub.add_parser("resolve", help="where would the service manager find this executable?")
    s.add_argument("name")
    s.set_defaults(fn=cmd_resolve)

    s = sub.add_parser("port", help="who is using a local TCP port?")
    s.add_argument("port", type=int)
    s.set_defaults(fn=cmd_port)
    return p


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    for stream in (sys.stdout, sys.stderr):
        # service logs contain arbitrary unicode (vite prints "➜"); never crash on a cp1252 console
        if stream is not None and hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="replace")

    args = build_parser().parse_args(argv)
    try:
        args.fn(Client(app_settings), args)
    except CliError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
