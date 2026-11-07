# USM UI: Shah-NVR reference notes

Reviewed 2026-11-07. Reference source: `D:/Drive-1/Shah-Secret-Project/Shah-NVR/nvr_client`. The reference was inspected read-only; changes are in USM's `client/`.

## Reference visual language

The NVR client is a monitoring console designed for long sessions. Its character comes from a soft dusk-slate palette, practical information density, consistent semantic colors, and restrained components. It does not use pure-black surfaces, bright-white cards, decorative gradients, or large marketing-style headings.

Sources inspected:

- `src/index.css`: dusk-slate tokens, Geist font, radii, dark native controls, thin scrollbars, touch target rules.
- `src/components/layout/AppLayout.tsx`: 224px desktop sidebar, 64px collapsed rail, 56px topbar, connection pill, clock, bottom mobile navigation and menu drawer.
- `src/components/common.tsx`: compact page headers, icon-backed KPI cards, descriptive hints, label/value fields.
- `src/components/StatusBadge.tsx`: semantic pill badges with tinted backgrounds, subtle outlines, and a small state dot.
- `src/components/UsageBar.tsx`: thin rounded resource bars with semantic warning thresholds.
- `src/components/ui/card.tsx` and `button.tsx`: restrained rounded panels and compact outline/primary controls.
- `src/features/dashboard/DashboardPage.tsx` and `src/features/nodes/NodesPage.tsx`: KPI-first hierarchy, monitoring tables, practical status and resource information.

## Palette and type

| Role | Reference color | USM application |
|---|---|---|
| Workspace | `#2e3440` | Main canvas |
| Sidebar | `#272c36` | Navigation and log/configuration surfaces |
| Card | `#3b4252` | Metrics, project cards, tables, dialogs |
| Secondary surface | `#434c5e` | Hover states and secondary controls |
| Border | `#4c566a` | Dividers, inputs, table boundaries |
| Primary text | `#eceff4` | Titles, values, important labels |
| Secondary text | `#a9b1c2` | Descriptions and metadata |
| Cyan | `#88c0d0` | Primary actions, active navigation, resource meters |
| Green | `#a3be8c` | Healthy/running state |
| Amber | `#ebcb8b` | Backoff/degraded state |
| Red | `#bf616a` | Reserved danger token |
| Purple | `#b48ead` | Supporting runtime distinction |

Geist variable is bundled locally, with the font's license, so the interface retains the reference's typography without an external font dependency. Monospace is reserved for process IDs, paths, logs, and technical values. Body and table text are larger than the first USM prototype to improve readability against dark surfaces.

## Adaptation to USM

Retain USM's existing routes and domain: workspace overview, projects, services, logs, events/audit, and settings. Borrow the NVR client's visual conventions rather than its surveillance-specific workflows.

- Keep a concise page heading and description above operational content.
- Use icon-backed compact KPI cards, then projects and service activity.
- Use softly rounded panels with subtle outlines and minimal shadow.
- Keep state visible through both text and color. Healthy, stopped, and backoff remain distinguishable without relying only on the dot.
- Use a cyan primary button and quieter outlined secondary actions.
- Put connection status in the slim topbar with a readable clock.
- Support a collapsible desktop sidebar and bottom mobile navigation with a drawer for secondary screens.
- Keep dense technical tables horizontally scrollable on narrow screens.
- Increase coarse-pointer touch targets while preserving compact desktop controls.
- Preserve all existing sample-data interactions, downloads, filtering, and navigation.

This remains a static HTML/CSS/JavaScript preview. The NVR client's React, Tailwind, shadcn, API hooks, branding, and surveillance data are not imported. No USM backend integration or real process control is introduced.

## Verification

Check desktop and mobile rendering, every route, service filters, project creation, project tabs, logs, audit tabs, dialogs, sidebar collapse, and mobile navigation. Confirm all assets load locally and the browser reports no JavaScript errors. Theme work does not require running backend process-supervision tests.

Validation completed in headless Edge at 1440px desktop and 390px mobile widths. All routes, service search/status filtering, project creation, dependency/configuration tabs, log selection, audit tabs, sidebar collapse/expand, mobile navigation, and Escape-to-close behavior passed. The local Geist font loaded, no external requests or failed asset loads occurred, and no JavaScript errors were reported. Desktop/mobile screenshots were visually reviewed. JavaScript syntax and Git whitespace checks passed.
