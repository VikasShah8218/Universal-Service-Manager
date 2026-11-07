# Universal Service Manager (USM) — Architecture v2 (for locking)

> Status: DRAFT, ready to lock
> Builds on: `plane_01.txt` (fleet-oriented idea)
> Changes from plan 01: start **local-first, project-centric** (your real daily pain), keep the fleet/central server as Phase 4.

---

## 0. The problem in one sentence

Today, to run **Shah-NVR** you open 3 terminals:

```
cd central_manager && py main.py
cd node_manager    && py main.py
cd nvr_client      && npm run dev
```

USM replaces that with: **open UI → Project "Shah-NVR" → Start** (or it starts by itself on boot), and USM owns those processes: starts them in the right order, watches them, restarts them when they crash, shows logs, and stops them cleanly.

Mental model: **PM2 + docker-compose + supervisord, but technology-agnostic, with a web UI, on Windows and Linux.**

---

## 1. Core domain model (lock this first — everything else depends on it)

```
Workspace (one machine / one USM daemon)
└── Project            e.g. "Shah-NVR"
    ├── Profile        e.g. "dev", "prod"   (overrides env/commands per profile)
    ├── Variables      project-wide env (.env import supported)
    └── Service        e.g. "central-manager", "node-manager", "nvr-client"
        ├── kind           long_running | one_shot | scheduled
        ├── runtime        python | node | binary | shell | docker | os_service(adopt)
        ├── command        exe + args (argv list, NOT a shell string by default)
        ├── cwd            working directory
        ├── env            own env + inherits project vars
        ├── depends_on     [service ids] + condition (started | healthy | completed)
        ├── readiness      how we know it is UP (port / http / log regex / delay)
        ├── health_checks  how we know it stays OK (process / http / tcp / script)
        ├── restart_policy never | on_failure | always  + backoff + max attempts
        ├── stop_policy    graceful signal → timeout → force kill tree
        └── log_policy     capture, rotate size, retention
```

Example — Shah-NVR as USM sees it:

```yaml
project: Shah-NVR
autostart_on_boot: true
services:
  - id: central-manager
    runtime: python
    command: ["D:/.../central_manager/.venv/Scripts/python.exe", "main.py"]
    cwd: "D:/.../central_manager"
    env: { PYTHONUNBUFFERED: "1" }
    readiness: { type: tcp, port: 8000, timeout_s: 30 }
    health_checks: [{ type: http, url: "http://127.0.0.1:8000/health", interval_s: 10, failures: 3 }]
    restart_policy: { mode: on_failure, max: 5, window_s: 600, backoff: [1, 2, 5, 15, 30] }

  - id: node-manager
    runtime: python
    command: ["D:/.../node_manager/.venv/Scripts/python.exe", "main.py"]
    cwd: "D:/.../node_manager"
    depends_on: [{ id: central-manager, condition: healthy }]
    readiness: { type: tcp, port: 8100 }

  - id: nvr-client
    runtime: node
    command: ["npm", "run", "dev"]
    cwd: "D:/.../nvr_client"
    depends_on: [{ id: central-manager, condition: healthy }]
    readiness: { type: log_regex, pattern: "Local:\\s+http://" }
    restart_policy: { mode: on_failure, max: 3 }
```

UI shows this as forms; YAML is just the export/import format.

---

## 2. High-level architecture (V1 = single machine)

```
┌───────────────────────────── OS (boot) ─────────────────────────────┐
│  Windows: Service (SCM) or Task Scheduler "at logon"  |  Linux: systemd │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ starts + restarts
┌───────────────────────────────▼─────────────────────────────────────┐
│                     USM DAEMON  (Python 3.12, asyncio)               │
│                                                                      │
│  ┌──────────── API layer (FastAPI, bound to 127.0.0.1) ───────────┐  │
│  │  REST /api/...   WebSocket /ws (status, logs stream)            │  │
│  │  Serves built React UI as static files                          │  │
│  └───────────────┬────────────────────────────────────────────────┘  │
│                  │ commands (start/stop/restart/apply-config)        │
│  ┌───────────────▼────────────────────────────────────────────────┐  │
│  │  ORCHESTRATOR  (project level)                                   │  │
│  │  - dependency DAG, start/stop ordering, profile resolution      │  │
│  │  - config diff → which services need restart                    │  │
│  └───────────────┬────────────────────────────────────────────────┘  │
│                  │ one per service                                   │
│  ┌───────────────▼────────────────────────────────────────────────┐  │
│  │  SERVICE SUPERVISOR  (asyncio task + state machine per service) │  │
│  │  desired_state vs observed_state → reconcile                    │  │
│  │  ├─ Runner      (spawn / stop / kill process TREE)              │  │
│  │  ├─ Probes      (readiness + health checks)                     │  │
│  │  ├─ Restart policy (backoff, crash-loop breaker)                │  │
│  │  └─ Log pump    (stdout/stderr → ring buffer + rotating file)   │  │
│  └───────────────┬────────────────────────────────────────────────┘  │
│                  │                                                   │
│  ┌───────────────▼──────────┐  ┌─────────────────────────────────┐  │
│  │ PLATFORM LAYER            │  │ EVENT BUS (in-process, asyncio) │  │
│  │ win: Job Objects, CTRL_   │  │ state changes, logs, alerts →   │  │
│  │      BREAK, DPAPI         │  │ WS clients, DB, notifiers       │  │
│  │ linux: setsid/pgid, cgroup│  └─────────────────────────────────┘  │
│  └──────────────────────────┘                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ STORAGE: SQLite (config, state, events, audit) + log files    │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ spawns & owns
        ┌──────────────────────────┼──────────────────────────┐
   py main.py (central)     py main.py (node)          npm run dev → node → vite
```

Plus a thin **CLI** (`usm up shah-nvr`, `usm logs nvr-client -f`, `usm status`) that talks to the same local API. Very useful when the UI is broken.

### Why this shape (vs plan 01)

| Decision | Reason |
|---|---|
| Daemon embeds FastAPI + serves React | One install, one process, works offline. No Postgres/Redis needed for V1. |
| UI is only a *client* | Closing the browser never affects services. Daemon is the single owner. |
| One asyncio task per service | Isolation: a hung health check on one service can't freeze the others. |
| SQLite, not Postgres | Local-first; Postgres arrives only with the central server (Phase 4). |
| Central server later | Same daemon later gets a "connector" module that syncs to central. No rewrite. |

---

## 3. Service state machine

Three separate fields — never mix them:

- **desired**: `RUNNING | STOPPED` (what the user/policy wants)
- **process**: `NOT_STARTED | STARTING | RUNNING | STOPPING | EXITED(code) | CRASHED`
- **health**: `UNKNOWN | READY | HEALTHY | DEGRADED | UNHEALTHY`

Derived display state:

```
STOPPED ──start──► WAITING_DEPS ──deps ok──► STARTING ──ready──► HEALTHY
                         │                        │                 │  ▲
                   deps failed               timeout/crash     checks fail│ checks pass
                         ▼                        ▼                 ▼  │
                     BLOCKED                  BACKOFF ◄──────── UNHEALTHY
                                                 │ attempts exhausted
                                                 ▼
                                              FAILED (needs human / manual reset)
any ──user stop──► STOPPING ──► STOPPED   (desired=STOPPED → never auto-restart)
```

Rule: **auto-restart only if desired=RUNNING.** That's how a manual stop is never "fixed" by the system.

---

## 4. Control bandwidth — what USM controls and what it does NOT

### 4.1 Control levels (build in this order)

| Level | Capability | V1? |
|---|---|---|
| L0 Observe | status, PID, CPU/RAM, ports, uptime, logs | ✅ |
| L1 Lifecycle | start / stop / restart / kill one service | ✅ |
| L2 Orchestrate | start/stop whole project in dependency order, profiles | ✅ |
| L3 Auto-heal | health checks, restart policy, crash-loop breaker | ✅ |
| L4 Configure | edit env/args/cwd via UI, diff + "apply" (restarts only changed) | ✅ |
| L5 Automate | rules: "if X then Y" (typed actions only), notifications | Phase 3 |
| L6 Adopt | control existing Windows services / systemd units / Docker containers | Phase 3 |
| L7 Fleet | multiple machines, central server, RBAC, remote commands | Phase 4 |

### 4.2 Ownership modes (per service)

| Mode | Who spawns the process | What USM can do |
|---|---|---|
| **Managed** (default) | USM | Everything: start/stop/restart/logs/env |
| **Adopted** | OS (SCM/systemd/Docker/PM2) | Call native manager; logs only if the manager exposes them |
| **External** | Someone else / remote | Health check + alert only. No restart. |

Never let two supervisors restart the same thing (e.g. PM2 *and* USM). Pick one owner.

### 4.3 Explicitly OUT of scope (lock this, it protects the project)

- Not a container orchestrator (no Kubernetes replacement).
- Not a build system (it *can* run a one-shot `npm install` step, but doesn't manage dependencies).
- No arbitrary shell execution from rules — rules call typed actions only.
- No recovery of a frozen/powered-off OS (needs external watchdog).
- No automatic failover of stateful systems (DB primary election etc.).
- V1: no remote access to the UI (localhost only).

### 4.4 Capacity targets for V1 (so we can test against numbers)

| Metric | Target |
|---|---|
| Services per daemon | 50 |
| Min health check interval | 2 s |
| Log throughput | 5 MB/s total without blocking a child |
| Log retention | 10 MB × 5 files per service (configurable) |
| UI live log latency | < 500 ms |
| Daemon idle RAM | < 80 MB |
| Crash detection → restart start | < 1 s (+ backoff) |

---

## 5. Edge cases (the real work is here)

### A. Process control

1. **Process trees / orphans** — `npm run dev` → `cmd` → `node` → `esbuild`. Killing the `npm` PID leaves vite running and the port stays busy.
   → Windows: put every service in its own **Job Object**; stop = terminate the job. Linux: start with `setsid` (new process group), kill `-pgid`; optionally cgroups.
2. **Graceful stop on Windows** — there is no SIGTERM. Spawn with `CREATE_NEW_PROCESS_GROUP` and send `CTRL_BREAK_EVENT`; wait `stop_timeout` (default 10 s); then terminate the job. Linux: SIGTERM → wait → SIGKILL on group.
3. **Reloaders** — `uvicorn --reload`, `nodemon`, vite, Django runserver spawn a watcher parent + worker child. The worker may restart itself; that's NOT a crash. Watch the parent PID only, and count health, not child PIDs.
4. **Daemon restarts while services run** — decide (see Lock D3). Recommended: services **survive**; daemon stores `PID + process create time` and re-adopts on startup (create time prevents PID-reuse mistakes). Logs from re-adopted processes are lost until restart unless we redirect to files instead of pipes → so **children write to log files via the daemon's pipe-relay**, and V1 accepts that re-adopted processes lose live logs until next restart.
5. **PID reuse** — always verify (pid, create_time, exe) before killing anything. Never kill by PID alone.
6. **stdin** — some apps wait on input (`Press any key`, prompts). Always give children a closed/NUL stdin.
7. **Exit code meaning** — `one_shot` with exit 0 = success (e.g. migration); `long_running` exit 0 = still unexpected → treat per restart policy (`always` restarts, `on_failure` doesn't).
8. **Start timeout** — process runs but never becomes ready → kill tree, mark failure, backoff.
9. **Zombie/hung process** — PID alive but health fails forever → health-based restart, not just exit-based.

### B. Environment & runtime (biggest Windows pain)

10. **PATH differs** under Windows Service (SYSTEM, session 0) vs your user. `npm`, `py`, `nvm`, `pyenv` may not be found.
    → Resolve executables to **absolute paths at config time** (UI does `which` and stores result), and/or run the daemon **as your user** (see Lock D1).
11. **`npm` on Windows is `npm.cmd`** — can't be spawned without a shell. Runner must resolve `.cmd/.bat` and launch via `cmd /c` safely (argv quoted), or call `node <path-to-npm-cli.js>` directly.
12. **Virtualenvs** — use the venv's `python.exe` directly; no "activate" needed. UI offers "detect venv" in cwd.
13. **Python output buffering** — logs appear late/never. Auto-inject `PYTHONUNBUFFERED=1`. For node, `FORCE_COLOR=1` if you want colors.
14. **ANSI colors / unicode** in logs — store raw bytes, decode UTF-8 with `errors=replace`, render ANSI in UI (xterm.js or ansi-to-html). Set `PYTHONIOENCODING=utf-8`.
15. **Paths with spaces/dots** — your user folder is `Mr. Shah`. argv lists (no shell strings) avoid quoting bugs. Test this explicitly.
16. **`.env` files** — support import; precedence: service env > profile env > project env > `.env` file > daemon env.
17. **Secrets** — stored encrypted (Windows DPAPI / Linux keyring or a key file with 600 perms); masked in UI and logs API.

### C. Network / ports

18. **Port already in use** (you ran `py main.py` manually earlier) → pre-start check; show *which PID* owns it; offer "kill it" or "adopt as External".
19. **Vite auto-switches port** (5173 → 5174) when busy → readiness via log regex, or force `--strictPort`.
20. **Health check targets `localhost`** → IPv6 `::1` vs `127.0.0.1` mismatch on Windows. Default to `127.0.0.1`.
21. **Firewall prompts** on first run of a new exe under a service account — document it.

### D. Orchestration

22. **Dependency cycles** → reject at save time (DAG validation).
23. **Dependency dies while dependents run** → policy per edge: `ignore | restart_dependents | stop_dependents`. Default `ignore` (most apps reconnect).
24. **Restart storm** — central-manager crashes, both dependents fail health → don't restart everything 3×. Root-cause first: if a dependency is unhealthy, dependents go `BLOCKED`, not `BACKOFF`.
25. **Partial project start** — one service FAILED → project state = `DEGRADED`; others keep running.
26. **Stop order** — reverse of start order.
27. **Config edit while running** — compute diff; only restart services whose spawn-relevant fields changed; ask before restarting.

### E. Daemon & OS lifecycle

28. **Two daemons running** → single-instance lock (named mutex on Windows / lock file + flock on Linux).
29. **Daemon crash** → OS restarts it (SCM recovery / systemd `Restart=on-failure`). Daemon must be idempotent on startup.
30. **Daemon event loop hangs** → internal watchdog thread; systemd `WatchdogSec`; on Windows the watchdog thread exits the process so SCM restarts it.
31. **Laptop sleep/hibernate** → on resume every health check fails at once. Detect a large clock jump → grace period (e.g. 30 s) before counting failures.
32. **Shutdown/reboot** → on OS shutdown signal, stop projects gracefully within the OS deadline (Windows gives ~20 s to services).
33. **Boot before network/disk ready** → `autostart_delay_s` per project; dependencies on external DB use readiness waits, not fixed sleeps.
34. **Disk full** from logs → hard caps, rotation, and daemon keeps working when log writes fail.
35. **Clock changes (NTP)** → use monotonic clock for intervals/backoff; wall clock only for display.

### F. Security (USM is effectively a "run any command" machine)

36. **API = remote code execution** if exposed. Bind `127.0.0.1` only in V1.
37. **Other local websites attacking it** (CSRF, DNS rebinding) → check `Host` and `Origin` headers, require a token (stored in a file only your user can read; UI gets it at login).
38. **Privilege** — if daemon runs as SYSTEM/root, every service runs as SYSTEM/root. Allow `run_as` only in later phases; V1 runs as the installing user.
39. **Audit** — every start/stop/config change logged with who/when/what.

### G. UI / UX

40. Browser closed → nothing changes. Browser reopened → full state resync via REST then WS deltas.
41. Multiple tabs → all receive the same WS events; commands are idempotent (`command_id`).
42. Huge log bursts → UI virtualizes the log view; server sends batched frames, drops to "tail" mode if client is slow (never blocks the child process).

---

## 6. Decisions to LOCK (my recommendation in bold)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | How the daemon starts on Windows | (a) Windows Service as SYSTEM, (b) Windows Service as your user account, (c) Task Scheduler "at logon" | **(c) for V1 dev use** (your PATH, nvm, venv just work; GUI/tray possible). Add (b) for headless servers in Phase 2. Linux: systemd (user unit for dev, system unit for servers). |
| D2 | Source of truth for config | DB / YAML files | **SQLite is truth; YAML import/export** per project (so you can git it). |
| D3 | Services survive daemon restart? | survive + re-adopt / die with daemon | **Survive + re-adopt** via PID+create_time (no `KILL_ON_JOB_CLOSE`). |
| D4 | Command format | shell string / argv list | **argv list**, with opt-in `shell: true` for power users. |
| D5 | Log transport | pipes → daemon / child writes files | **Pipes → daemon** (ring buffer + rotate files). |
| D6 | API exposure V1 | localhost / LAN | **localhost + token**. LAN only with TLS + auth (Phase 4). |
| D7 | Rules engine | free script / typed actions | **Typed actions** (`restart`, `stop`, `notify`, `run_one_shot(service_id)`). |
| D8 | Agent language | Python / Go / Rust | **Python** (your stack). Keep the platform layer isolated so a Go rewrite of the daemon is possible later. |
| D9 | Frontend | React + TS | **React + TS + Vite**, TanStack Query for REST, native WS, xterm.js for logs. |
| D10 | Packaging | PyInstaller / Nuitka / plain venv | **PyInstaller one-folder** + Inno Setup installer (Windows), `.deb` + systemd unit (Linux). |

Key Python libs: `psutil` (process info, ports, create_time), `pywin32` (Job Objects, services, DPAPI), `anyio/asyncio` subprocess, `httpx` (HTTP checks), `pydantic` (config validation), `SQLAlchemy`/`sqlmodel` + SQLite, `uvicorn`.

---

## 7. Repository layout

```
Universal-Service-Manager/
├── daemon/                      # the USM daemon (installed on each machine)
│   └── usm/
│       ├── main.py              # entry: single-instance lock, boot, run loop
│       ├── api/                 # FastAPI routers, WS, auth (token, Host/Origin check)
│       ├── domain/              # pydantic models: Project, Service, Policy...
│       ├── orchestrator/        # DAG, ordering, profiles, config diff
│       ├── supervisor/          # per-service state machine + reconcile loop
│       ├── runner/              # spawn/stop/kill-tree, cmd resolution
│       ├── probes/              # tcp, http, log_regex, process, script
│       ├── logs/                # pump, ring buffer, rotation
│       ├── platform/
│       │   ├── base.py          # ProcessHandle interface
│       │   ├── windows.py       # Job Objects, CTRL_BREAK, DPAPI, mutex
│       │   └── linux.py         # setsid, pgid kill, flock
│       ├── events/              # in-process bus
│       ├── storage/             # SQLite repos, migrations
│       └── watchdog.py
├── cli/                         # `usm` command (thin client over local API)
├── ui/                          # React + TS
│   └── src/pages/  Projects, ProjectDetail, ServiceDetail(Logs/Health/Config), Events, Settings
├── packaging/  windows/ linux/
├── tests/      unit/ integration/ fixtures/ (fake services: crasher, slow-start, log-flood, port-hog)
└── plane/      # design docs (this file)
```

`tests/fixtures` matters: build tiny fake services that crash, hang, flood logs, ignore CTRL_BREAK, spawn grandchildren, hold a port. Most edge cases above become automated tests with them.

---

## 8. Local API (V1)

```
GET    /api/projects
POST   /api/projects                     create
PUT    /api/projects/{id}                update (returns diff + restart plan)
POST   /api/projects/{id}/actions        {action: start|stop|restart, command_id}
GET    /api/projects/{id}/services
POST   /api/services/{id}/actions        {action: start|stop|restart|kill|reset_failed}
GET    /api/services/{id}/logs?tail=500
GET    /api/services/{id}/events
POST   /api/tools/resolve-exe            {"name":"npm"} → absolute path
POST   /api/tools/check-port             {"port":5173} → owner pid/name
POST   /api/projects/import  /export     YAML
WS     /ws                               status deltas, log lines (subscribe per service)
```

---

## 9. Roadmap (each phase ends with tests passing on Windows + Linux)

**Phase 1 — Core supervisor (no UI)**
Runner + Job Objects/pgid, kill tree, graceful stop, log pump, state machine, restart policy, SQLite, CLI.
✅ Exit test: Shah-NVR's 3 services start with `usm up shah-nvr`, `taskkill` one → it comes back, `usm down` leaves **zero** orphan processes and free ports.

**Phase 2 — Web UI + autostart**
FastAPI + WS, React pages, project/service forms, live logs, exe/venv detection, port check, autostart on boot/logon, single-instance, watchdog.
✅ Exit test: reboot → Shah-NVR is running without touching anything; UI shows live logs.

**Phase 3 — Orchestration & automation**
Dependencies + readiness, profiles, config diff/apply, rules + notifications (desktop/Telegram/email), adopt Windows services/systemd/Docker, sleep-resume grace.

**Phase 4 — Fleet**
Central server (FastAPI + Postgres), agent enrollment, mTLS, RBAC, remote commands with idempotency, offline buffering, agent self-update. (This is where plan_01's design comes back.)

---

## 10. Definition of "architecture locked"

Before writing Phase 1 code, confirm:
- [ ] Domain model (§1) accepted
- [ ] Control levels & out-of-scope list (§4) accepted
- [ ] D1–D10 (§6) decided
- [ ] Capacity targets (§4.4) accepted
- [ ] Edge cases §5 A, B, E are Phase 1/2 must-haves; C, D, F, G scheduled
