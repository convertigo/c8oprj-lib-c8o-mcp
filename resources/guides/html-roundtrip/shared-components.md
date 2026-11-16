# Creating and placing shared components, boundaries

Read when: Creating and placing shared components, boundaries. Summary: `convertigo://guides/html-roundtrip`.
Previous: `convertigo://guides/html-roundtrip/scss-ts`.

---

## Creating and placing shared components
- Create: write its files in `src/app/components/<project>.<component>/` (lower case): `<project>-<component>.html`, `.scss` if it has styles, and the sidecar `<project>-<component>.c8o-map.json`:
  `{"version": 1, "strategy": "structured-tree-v2", "kind": "sharedComponent", "project": "<Project>", "name": "<Component>", "create": {"name": "<Component>", "variables": [{"name": "Text", "mode": "plain", "value": ""}]}, "files": {"html": "_private/ionic/src/app/components/<project>.<component>/<project>-<component>.html", "scss": "..."}}`
  In its html a variable is `{{this?.Text}}`; write palette tags, no anchors. Import it with `ionicTarget` = the sidecar: the engine then generates its files with their anchors.
- Place: write its selector `<project>-<component>` (lower case, as the generated html of the pages shows) in the page html, with its variables as bindings: `<democonges-helpbanner [Text]="'Aide...'"></democonges-helpbanner>`. Import the page after the component.
- Other sidecar kinds, for the cases the html cannot say: `"kind": "useSharedComponent"` (`"qname"` of the page, `"create": {"sharedComponent", "target": {"classToken"} or {"priority"}, "useName", "variables"}`), `"kind": "sharedAction"` (`"create": {"name", "customActionName", "async", "variables"}`, `"files": {"ts"}`) and `"kind": "invokeSharedAction"` (`"qname"`, `"create": {"sharedAction", "target", "eventName": "onClick", "invokeName", "variables"}`).
- Never change the sidecars the engine generated: they map the files back to their objects.

## Boundaries
- Shared components of referenced projects (libraries) are not imported: the report warns about their changed files. Change them in their own project.
- Everything else under `_private/ionic` (package files, modules, routes, services, `global.scss`) and `DisplayObjects` stays generated: never edit it. Your file tools write under `_private/ionic/src/app` only.
- Backend objects, data sources and new business sequences are still authored with the tree tools; do the backend part first, then the visual part here.
