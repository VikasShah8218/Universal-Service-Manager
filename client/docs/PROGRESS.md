# Client application progress

## Current checkpoint

Date: 2026-11-07. Phase: implementation complete and verified.

Completed: C01–C12. React/Vite/Tailwind foundation, strict interfaces, grouped API modules, token login and protected routing, centralized themes/preferences, responsive shell, all pages, project/service forms, YAML import/export, diagnostics, and separate demo transport. The production build, thirteen unit tests, eight browser workflows, and an isolated real-daemon/process lifecycle smoke test all pass. No backend source changes.

## Decisions

- React + TypeScript + Vite + Tailwind. React Router for pages; TanStack Query for server-state polling/cache invalidation; Lucide icons; Sonner feedback.
- Keep `client-static/` unchanged as the approved visual reference.
- Dusk theme tokens in `src/styles/theme.css`; presentation preferences in a dedicated provider. Never hard-code palette values in individual pages.
- Use the local daemon's token as login credential. Validate through `GET /api/v1/status`. No password/account endpoints exist.
- Token stays in memory by default; optional sessionStorage is limited to the current tab. Logout/401 clears session and query cache.
- Same-origin `/api` transport through Vite's loopback proxy, avoiding backend CORS changes. Production requires an equivalent same-origin proxy.
- Group HTTP services as system, projects, runtime, logs, events, and tools. Pages access them through typed hooks/services.
- Demo transport is explicit and isolated from live requests; never fall back to fake data after an API error.
- Interface settings are client preferences only. Daemon configuration remains environment-based.
- Long configuration dialogs close through Close, Cancel, or Escape rather than an easy-to-misclick backdrop, protecting unsaved service drafts.

## Resume procedure

1. Read `TASKS.md`, this file, `API.md`, and `ARCHITECTURE.md`.
2. Inspect the current source and Git status; preserve unrelated work.
3. Add future work to `TASKS.md`, including its real API contract, before implementation.
4. Record file locations, commands, results, and unresolved issues here after each completed phase.

## Verification ledger

- `npm run typecheck`: passed strict TypeScript checking.
- `npm run build`: passed production build. Page/demo code splitting keeps generated chunks below the warning threshold.
- `npm test`: 13 passed (HTTP contracts and log buffer pagination/restart/bounding).
- `npm run test:browser`: 8 passed. Covers route protection, rejected/valid tokens, memory and opt-in tab sessions, 401 logout, offline errors, demo isolation, navigation, project/service editing and actions, configuration, YAML import/export, logs, events, tools, appearance, and mobile layouts.
- Project create/edit flow additionally passed five consecutive focused repetitions after hardening draft-dialog dismissal.
- `npm run test:live`: passed against an isolated temporary real manager. Verified token login, project/service creation, process start, captured stdout, events/audit, YAML export, process stop, deletion, and cleanup.
- `npm run format:check`: passed across source, tests, scripts, and documentation.
- Desktop/mobile screenshots were generated in ignored `test-results/`; the desktop design was visually reviewed.
- Remaining implementation work: none for the requested client scope. Future backend capabilities should follow `ARCHITECTURE.md` and update `API.md` rather than inventing client-only endpoints.
