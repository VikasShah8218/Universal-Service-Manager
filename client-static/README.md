# USM static interface

A responsive, UI-only preview of Universal Service Manager. Built with plain HTML, CSS, and JavaScript; no installation or build step is required.

Open `index.html` directly in a browser. Alternatively, from this folder run:

```powershell
python -m http.server 5173
```

Then visit `http://localhost:5173`.

Includes overview, projects, project service/dependency/configuration tabs, services with search and status filters, logs, events/audit, and settings. New projects and service actions change in-memory sample data only. YAML export and log download save sample files. No backend requests are made and no real processes are controlled. Reload to reset the preview.

The dusk-slate theme is inspired by the Shah-NVR client: soft charcoal-blue surfaces, cyan accents, Geist typography, rounded status badges, and compact monitoring panels. Design notes are in `../docs/ui-design-notes.md`.

Geist is bundled locally in `assets/fonts` with its SIL Open Font License. Technical values use local monospace fallbacks. Icons are inline SVG. The UI makes no external font or asset requests and works offline. Desktop navigation collapses to an icon rail; mobile has a bottom navigation bar and a menu drawer.
