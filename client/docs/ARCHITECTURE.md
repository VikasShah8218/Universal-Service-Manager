# Client architecture and resume guide

## System boundary

The browser is a control surface for one loopback Universal Service Monitor daemon. It does not own process state and does not reproduce the manager engine. Live state always comes from FastAPI under `/api/v1`; mutations schedule backend work, then query polling observes the resulting state.

```text
Browser route/page
      │
      ├── feature components ── typed hooks ── TanStack Query cache
      │                                           │
      │                                      domain API modules
      │                                           │
      ├── live session ── same-origin /api proxy ─┴── FastAPI daemon
      │
      └── demo session ── in-memory transport (no network request)
```

The transport interface is the seam between live and demo modes. Both expose the same response shapes, so pages do not contain demo branches. A live error remains an error; it never activates sample data.

## Ownership by layer

| Layer              | Responsibility                                                 | Must not own                              |
| ------------------ | -------------------------------------------------------------- | ----------------------------------------- |
| `pages/`           | Route composition and page-level selection state               | Raw fetch calls or protocol parsing       |
| `features/`        | Forms and cohesive user workflows                              | Global navigation or backend engine logic |
| `components/`      | Reusable presentation and small interactions                   | API endpoint knowledge                    |
| `hooks/`           | Queries, polling, mutations, cache invalidation                | Markup-heavy page layouts                 |
| `api/services/`    | Domain endpoint paths and request/response types               | React state                               |
| `api/http.ts`      | Headers, encoding, cancellation, timeouts, error normalization | Domain-specific behavior                  |
| `types/`           | Shared backend contracts                                       | UI state when a type is feature-local     |
| `demo/`            | Deterministic isolated sample behavior                         | Live fallback or production credentials   |
| `styles/theme.css` | Semantic color/theme tokens                                    | Component-specific layout rules           |

## Authentication and session lifecycle

There is no account or password API. Login accepts the daemon API token and verifies it with `GET /status`. The authenticated API instance receives the token through an in-memory session closure. An optional tab-scoped copy is stored only after the user opts in. A `401` clears session state and the query cache immediately, then protected routing returns to login.

Demo mode creates a fresh lazy-loaded in-memory transport. Entering demo or leaving a session clears cached server state, preventing data from crossing session boundaries.

## Server state and mutations

`useWorkspace` is the shared status query. Other query keys always include the relevant project and service slugs. Mutations invalidate workspace, project/service details, events, and audit history so the next poll reflects backend truth. Buttons expose pending states and avoid duplicate control requests.

Project configuration is one aggregate: services are nested in `ProjectSpec`. Creating or editing a service therefore saves the project specification rather than calling an invented service CRUD endpoint. Advanced JSON editing preserves policy fields the guided form does not simplify.

## Log following

Log polling maintains its own bounded buffer of 2,000 lines. It advances from the last line actually received, drains truncated pages, de-duplicates sequences, and detects a manager restart when sequence values roll back. Pausing stops network polling; clearing only resets the visible local buffer. This avoids skipped lines and unbounded browser memory.

## Design system

`src/styles/theme.css` is the palette authority. Components use semantic tokens such as `background`, `card`, `primary`, `success`, `warning`, and `danger` rather than raw palette values. `PreferencesProvider` applies theme, accent, refresh interval, and sidebar state at the document boundary. Adding a theme should start with a token set, not page-level color changes.

## Adding a backend capability

1. Confirm the real route and schema in the backend; do not infer an endpoint from the desired UI.
2. Add or extend a contract in `src/types/`.
3. Add the endpoint to the matching `src/api/services/` module.
4. Add query/mutation behavior and precise cache invalidation in a hook.
5. Compose the interaction in a feature or page using existing UI primitives.
6. Mirror the contract in the demo transport only when the feature belongs in demo mode.
7. Add transport/logic tests and a browser flow for user-visible behavior.
8. Update `API.md`, `TASKS.md`, and `PROGRESS.md`.

## Resume checklist

Read `TASKS.md`, `PROGRESS.md`, and `API.md`, then inspect Git status before editing. Preserve `client-static/` as the approved reference and do not change backend source during client-only work. Run `npm run typecheck`, `npm test`, and `npm run build` for ordinary changes; add `npm run test:browser` for workflows and `npm run test:live` for changes to real API/process integration.
