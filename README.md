# Universal Service Manager (USM)

Local-first, technology-agnostic service supervisor. Define a **project** (e.g. Shah-NVR) with its
**services** (Python, Node, binaries, anything), and USM starts them in dependency order, watches
them, restarts them when they crash, captures logs, and stops the whole process tree cleanly.

The backend is **[`service_manager/`](service_manager)** (FastAPI + Tortoise ORM).
Current architecture: [`docs/architecture.md`](docs/architecture.md).
Earlier design draft: [`docs/plane_02_architecture.md`](docs/plane_02_architecture.md).

## Quick start (Windows)

```powershell
cd service_manager
py -m venv .venv
.venv\Scripts\pip install -r requirements.txt

# terminal 1: the manager (keep it running)
.venv\Scripts\python main.py              # API + docs: http://127.0.0.1:7420/docs

# terminal 2: control it
.\usm import ..\examples\shah-nvr.usm.yaml   # edit paths/ports in the YAML first
.\usm up shah-nvr --wait
.\usm status
.\usm logs shah-nvr nvr-client -f
.\usm down shah-nvr
```

`usm.cmd` runs `cli.py` with the service's own venv (`py cli.py <command>` works too).

## Folder structure

```
service_manager/
  main.py              FastAPI app: lifespan (DB + engine), routers, `py main.py`
  cli.py, usm.cmd      command line client (talks to the API)
  settings/            Settings from .env (HOST, PORT, DATA_DIR, DATABASE_URL, ...)
  database/config.py   Tortoise ORM config (+ Aerich)
  app/
    projects/          project + service config: tables, validation, CRUD, YAML import/export
    runtime/           the engine and per-service supervisor (state machine, auto-restart,
                       dependency order, re-adopt after restart), start/stop APIs
    processes/         spawn / graceful stop / kill tree / re-adopt (Windows Job Object, POSIX pgid),
                       command + env resolution (npm without cmd.exe, .env files, ${VAR})
    health/            readiness + health probes (tcp, http, log line, delay, process)
    logs/              service log capture, tail, copy-truncate rotation, logs API
    events/            event log + audit trail
    tools/             folder browser, command detection, port / executable checks
  utilities/           shared helpers, security (token, loopback guard), single instance, watchdog
  tests/               integration tests with real processes (tests/fixtures)
  data/                (created at runtime) usm.sqlite3, token, manager.log, logs/<project>/<service>/
```

## How it works (short)

1. A project is created from YAML (`usm import`) or JSON (`POST /api/v1/projects`), validated by
   `app/projects/schemas.py` and stored in SQLite.
2. On start, each service gets a **supervisor** (`app/runtime/supervisor.py`): it waits for its
   dependencies, resolves the command, starts the process in its own Job Object (Windows) or
   process group (Linux), writes output to `data/logs/...`, and waits until it is ready.
3. While running, it watches for exit (instantly) and runs health checks (every N seconds).
   Crash or failed checks -> restart with backoff; too many restarts -> FAILED.
4. Stop = Ctrl+C / SIGTERM first, then kill the whole process tree.
5. If the manager exits or crashes, services keep running. The next start re-adopts them
   (PID + process start time), and a service you stopped manually stays stopped.

## API

All under `/api/v1` and protected by a token (`X-USM-Token` header, file `service_manager/data/token`).
Interactive docs: http://127.0.0.1:7420/docs

| | |
|---|---|
| `GET /status?stats=true` | every project + service, live state, CPU/RAM |
| `GET/POST /projects`, `GET/PUT/DELETE /projects/{id}` | config CRUD (`PUT ?restart_changed=true`) |
| `POST /projects/import`, `GET /projects/{id}/export` | YAML |
| `POST /projects/{id}/actions` | `{"action": "start"\|"stop"\|"restart", "services": [...]}` |
| `GET /projects/{id}/services/{sid}`, `POST .../actions` | `start` / `stop` / `restart` / `kill` / `reset` |
| `GET /projects/{id}/services/{sid}/logs?tail=200\|since=N` | logs |
| `GET /events`, `GET /audit` | history |
| `/tools/list-dir`, `/tools/detect`, `/tools/check-port`, `/tools/resolve-exe` | helpers for a UI |

## Tests

```powershell
cd service_manager
.venv\Scripts\python -m pytest -q
```

## Known limitations

- `taskkill /T` on the manager also kills its services (Windows treats them as its child tree).
  A crash, `taskkill` without `/T`, or a normal exit does not.
- After a manager restart, the exit code of a re-adopted POSIX process is unknown.
- A grandchild orphaned *while the manager was down* is not tracked after re-adoption.
- Not built yet: web UI, start-at-logon installer (Task Scheduler / systemd), notifications.
