# API classification and UI integration

Source of truth: `service_manager/app/*/router.py` and `schemas.py`. Prefix: `/api/v1`. All protected calls send `X-USM-Token` and `X-USM-Client: ui`. `/health` is public liveness. JSON validation failures use FastAPI `detail` arrays; domain failures use 404/409. No login, settings update, registration, WebSocket, or user-account endpoints exist.

| Service module | Endpoints                                                                                       | Screens/use                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `system.ts`    | GET `/health`, GET `/status?stats=true`                                                         | Login verification; overview/services/header polling; actual platform, version and manager uptime |
| `projects.ts`  | GET/POST `/projects`; GET/PUT/DELETE `/projects/{id}`                                           | Project list, create/edit, detail, delete                                                         |
| `projects.ts`  | POST `/projects/import?restart_changed=...` (raw YAML); GET `/projects/{id}/export` (text)      | YAML import/export                                                                                |
| `runtime.ts`   | POST `/projects/{id}/actions`                                                                   | Project start/stop/restart, optional subset                                                       |
| `runtime.ts`   | GET `/projects/{id}/services/{sid}`; POST `.../actions`                                         | Service spec/status, start/stop/restart/kill/reset                                                |
| `logs.ts`      | GET `/projects/{id}/services/{sid}/logs?tail=200` or `?since=N`                                 | Logs page, service logs; polling cursor and restart detection                                     |
| `events.ts`    | GET `/events?project=...&service=...&limit=...`; GET `/audit?limit=...`                         | Event timeline and audit table                                                                    |
| `tools.ts`     | POST `/tools/resolve-exe`, `/tools/check-port`, `/tools/detect`; GET `/tools/list-dir?path=...` | Diagnostic tools and project configuration helpers                                                |

## Interface boundaries

- `src/types/`: backend-facing domain contracts, including discriminated probe types. Optional input fields follow backend defaults.
- `src/api/http.ts`: fetch, token header, timeout/cancellation, response parsing, structured errors, unauthorized callback.
- `src/api/services/`: one small service per API domain. No React in these modules.
- `src/hooks/`: server queries, polling, mutation invalidation, bounded log-follow behavior.
- `src/features/`: page-specific forms/components and login implementation.
- `src/pages/`: route-level composition.
- `src/demo/`: independent in-memory fixtures/transport selected only by demo login.

## Behavior details

Project configuration is saved as one `ProjectSpec`; services are nested, not created through a separate service CRUD API. New projects do not start automatically. Updates can optionally restart changed services. Runtime actions acknowledge scheduling; status polling observes completion.

Project/service slugs are distinct from database integer IDs. Always use slugs in URLs and include the project in cache keys.

Log `seq` values reset on manager restart. Increment the cursor to the last returned line, not `last_seq` when a page is truncated; retain a bounded live buffer and request the beginning again after cursor rollback. Paused logs stop polling; resuming refetches.

API tokens are bearer-equivalent local command-execution credentials. Keep them out of URLs and build-time configuration. Demo and live sessions must clear one another's query cache.

Production output is static assets; serve behind a loopback same-origin proxy that sends `/api` to FastAPI. Vite proxy is for development/preview, not a production server.
