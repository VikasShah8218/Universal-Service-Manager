# Universal Service Monitor client

The client is a responsive React interface for the local Universal Service Monitor daemon. It keeps the restrained dusk-slate style of `client-static/`, while replacing the static mock-up with typed API integration, protected routes, process controls, live logs, events, audit history, and diagnostic tools.

## Start locally

Requirements: Node.js 22.12 or newer and the USM daemon listening on `127.0.0.1:7420`.

```powershell
cd client
npm install
npm run dev
```

Open `http://127.0.0.1:5156`. Sign in with the token stored by the daemon in `service_manager/data/token`, or choose **Explore demo** to inspect the interface without contacting the daemon.

The token is held in memory by default. “Remember for this tab” uses `sessionStorage`; the client never puts the token in a URL, source file, build setting, or `localStorage`.

To point development at another local daemon, copy `.env.example` to `.env.local` and set `USM_API_TARGET`. This value is a server-side Vite proxy target, not a browser credential.

## Commands

```powershell
npm run dev           # development server on 127.0.0.1:5156
npm run build         # strict TypeScript check and production bundle
npm run preview       # preview the built static assets
npm test              # HTTP and log-buffer unit tests
npm run test:browser  # Playwright user-flow checks
npm run test:live     # isolated temporary daemon + real process lifecycle smoke test
npm run format:check  # verify formatting
```

`test:live` uses `service_manager/.venv/Scripts/python.exe` by default on Windows. Set `USM_TEST_PYTHON` when the backend virtual environment lives elsewhere. It creates its own temporary data, database, ports, process, and token, then removes them; it does not operate on the developer's running USM instance.

## Structure

- `src/api/` — framework-free HTTP client and domain API modules.
- `src/app/` — routing, query cache, and presentation preferences.
- `src/components/` — reusable UI, layout, project, and service components.
- `src/features/` — cohesive login, project form, log, and tool features.
- `src/pages/` — route-level composition.
- `src/demo/` — explicit in-memory adapter; never an error fallback for live mode.
- `src/styles/theme.css` — centralized color, spacing, and theme tokens.
- `src/types/` — backend-facing TypeScript contracts.
- `docs/` — task ledger, progress, API map, and architecture/resume notes.
- `tests/` — unit and browser-level behavior tests.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for data flow and extension guidance, [docs/API.md](docs/API.md) for endpoint coverage, and [docs/PROGRESS.md](docs/PROGRESS.md) for the current handoff record.

## Deployment boundary

`npm run build` produces static files in `dist/`. In production, serve them on loopback behind the same origin as an `/api` reverse proxy to FastAPI. Vite's proxy is for local development only. The daemon deliberately has no browser CORS configuration, so deploying the assets on an unrelated origin is not supported without an explicit server-side proxy design.

Client settings affect presentation only. Manager polling, watchdog, stop policy, and other daemon settings still belong to backend environment configuration; the UI does not claim to save settings for which no API exists.
