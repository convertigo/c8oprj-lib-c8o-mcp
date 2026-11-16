# Convertigo NGX HTML Round-Trip

Read this in a conversation of the `html` edit profile before a visual change of an existing NGX page or shared component. There the generated HTML, SCSS and TypeScript under `_private/ionic/src/app` are edited as files, then imported back into the Convertigo objects; outside this profile they are never edited. New pages, data sources, sequence calls and Convertigo action chains stay tree work: do the backend and data part with the tree tools first.

Call `mobile-builder-open(project)` first: `ionicFiles` gives the files of every page and shared component. Read them and `palette-list` for the parent you edit; write palette tags. Keep every `class<priority>` anchor on its element, never copy, move or invent one. Import before any tree change of the same page or component: `project-reload(project=<project>, fromIonic=true, ionicTarget=<file, sidecar or folder>)`. Then read `ionicReport`: all counts at 0 means nothing was imported, `skipped > 0` and each warning are changes not applied. In the ts only the marker blocks are imported; keep every marker line. Never edit other files under `_private/ionic`, `DisplayObjects` or the engine's sidecars. Prove with `mobile-builder-open` and the browser, read the files again before a second edit, and list what `ionicReport` imported.

## Drawers
- `convertigo://guides/html-roundtrip/scope` — Files or tree: what this profile edits.
- `convertigo://guides/html-roundtrip/workflow` — Workflow, import and its report.
- `convertigo://guides/html-roundtrip/html` — HTML rules: anchors, attributes, directives and events.
- `convertigo://guides/html-roundtrip/scss-ts` — SCSS and TypeScript rules.
- `convertigo://guides/html-roundtrip/shared-components` — Creating and placing shared components, boundaries.
