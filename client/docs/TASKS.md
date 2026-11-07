# Client application tasks

Read this file together with `PROGRESS.md` before resuming. Update statuses after each completed phase. The original approved design lives in `../../client-static` and must remain intact.

## Scope and conventions

Build React + TypeScript + Tailwind + Vite in `client/`. Preserve the approved dusk-slate monitoring design. Use pages, small reusable components, typed domain interfaces, domain-specific API modules, and centralized theme tokens. Login uses the existing API token contract; no invented username/password backend. Keep demo data explicitly separate from live data. No backend source changes are required.

## Ordered work

- [x] C01 — Inspect the static design and backend routes/authentication.
- [x] C02 — Classify API services and record endpoint contracts in `API.md`.
- [x] C03 — Scaffold Vite, strict TypeScript, React, Tailwind, routing, and dependencies.
- [x] C04 — Add centralized theme/preference controls and reusable UI primitives.
- [x] C05 — Build login folder, session handling, protected routes, logout, and invalid-token handling.
- [x] C06 — Build responsive application shell, sidebar, header, mobile navigation.
- [x] C07 — Build typed HTTP transport, API modules, query hooks, and explicit demo adapter.
- [x] C08 — Overview, project list/create/import, project detail/edit/export/delete, service actions.
- [x] C09 — Services list/detail, dependency display, configuration editing, live log polling.
- [x] C10 — Events/audit, local interface settings, instance details, diagnostic tools.
- [x] C11 — Verify typecheck/build, API boundary tests, desktop/mobile browser flows, isolated real-backend integration.
- [x] C12 — Complete README, architecture/resume notes, API coverage, task/progress records.

## Acceptance criteria

- `npm install`, `npm run dev`, `npm run build`, and documented checks work.
- All screens use the same reusable components and semantic theme tokens; no duplicated static HTML application.
- Live mode uses real existing endpoints and handles loading, empty, error, unauthorized, pending-action states.
- Demo is opt-in, visibly labeled, and never sends process-control requests to the daemon.
- No token is embedded in source, build output, logs, URLs, or localStorage. Session persistence is opt-in and tab-scoped.
- Project/service identities use both project and service IDs. IDs are URL-encoded.
- Log polling resets on manager restart, stays bounded, and drains paginated sequences without skipping.
- No settings screen pretends to update daemon settings; there is no backend settings API.
- Documentation says exactly what is implemented, how to resume, and any verification limits.
