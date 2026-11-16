# Workflow, import and its report

Read when: Workflow, import and its report. Summary: `convertigo://guides/html-roundtrip`.
Previous: `convertigo://guides/html-roundtrip/scope`. Next: `convertigo://guides/html-roundtrip/html`.

---

## Mandatory workflow
1. Call `mobile-builder-open(project)` first. Its `ionicFiles.pages` and `ionicFiles.sharedComponents` give the html path of every page and shared component (the scss and ts lie next to it), so no search or tree read is needed to find them.
   - `ionicFiles.available: false`: the files or their `.c8o-map.json` sidecars are not generated yet. Wait for `status: "ready"` and call it again; if there is still none, use the tree route (`convertigo://guides/data-page`).
2. Read these files, and the global look (`src/app/app.component.scss`, existing toolbars and classes), before changing anything. Reading and editing these known paths is not a filesystem scan.
3. Call `palette-list` (and `palette-describe` for a component you use) for the parent you edit: write palette tags (`ion-button`, `ion-item`, `ion-card`, shared component selectors...) rather than generic HTML equivalents, so the import creates the real Convertigo components.
4. Edit the files (rules below). Import them before any tree change (`databaseobject-tree-apply`, delete, move, rename) of the same page or shared component: a tree change writes its files again, and the tools refuse it while they hold edits not imported.
5. Import: `project-reload(project=<project>, fromIonic=true, ionicTarget=<edited file, its .c8o-map.json, or the page/component folder>)`. With `ionicTarget` (relative to the project folder, or absolute), only that target is imported; without it, every sidecar of the project is. Both import into the loaded project, without a reload, save the project and write the generated files of what changed again.
6. Read the result before going on:
   - `status`: `imported_from_ionic`, `reloaded: true`.
   - `ionicReport.pagesUpdated`, `sharedComponentsUpdated`, `templatesUpdated`, `stylesUpdated`, `scriptsUpdated`: what was imported, and `changedObjects` the objects it changed. When the counts are all 0 after an edit, nothing was imported: the change is only in the file, the preview may show it, and the next generation loses it. Check the edit and the target, never report it as done.
   - `ionicReport.skipped > 0`: the HTML of a page or component could not be mapped to its existing tree; nothing of it was changed. Read the warning, restore the anchors or the structure it names, and import again, or make that change with the tree tools.
   - `ionicReport.warnings`: every warning is a change that was not applied (a scss that does not match its style components, a component of a referenced library, a removed header line...). Act on each one.
7. Prove the result: `mobile-builder-open` (compile state, viewer), then browser smoke as described in the frontend guides. The engine writes the files again after the import: read them again before a second edit. In the final answer, list what `ionicReport` imported.
