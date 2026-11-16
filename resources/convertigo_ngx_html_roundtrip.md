# Convertigo NGX HTML Round-Trip

## When to read this
Read this in a conversation of the `html` edit profile, before a visual change of an existing NGX page or shared component: texts, markup, layout, classes, styles, small UI TypeScript. In this profile the generated HTML, SCSS and TypeScript of the pages and shared components (under `_private/ionic/src/app` of the project) are the authoring surface for that work: you edit them as files with your file tools, and `project-reload(fromIonic=true)` imports them back into the Convertigo objects. Outside this profile these files stay generated and are never edited.

## Files or tree
- Files: every visual change of an existing page or shared component, a new shared component made of markup and styles (its variables included), and placing a shared component on a page. This includes an alert, menu or dialog opened by a button: an inline `ion-alert`, `ion-action-sheet`, `ion-popover` or `ion-modal` with `trigger="<id of the button>"` needs no event nor action (a toast is the palette Toast action under the click event).
- Files also hold small behaviours (a click that prints, copies, opens or shows a message): a method of the ts called from the html, see the event rule below. The default values of the variables of a shared component (its labels and titles) are its `@Input()` lines.
- Tree: new pages, data sources, calls to sequences, action chains made of Convertigo actions (CallSequence, SetLocal, NavigatePage...), bindings to sequences, backend objects. Do the backend and data part with the tree tools first, then the visual part here. To give an element of the html an event or an action, find its object with `databaseobject-search` on the number of its anchor (`class1757510317683` is the object of priority `1757510317683`).
- Pages built by `upsert-ngx-crud-kit`: running the kit again rewrites its managed objects, whether they were changed in files or in the tree. For visual changes the kit cannot express, edit the files.

## Mandatory workflow
1. Call `mobile-builder-open(project)` first. Its `ionicFiles.pages` and `ionicFiles.sharedComponents` give the html path of every page and shared component (the scss and ts lie next to it), so no search or tree read is needed to find them.
   - `ionicFiles.supported: false`: this engine has no round-trip import. Make the change with the tree tools and say so.
   - `ionicFiles.available: false` with `supported: true`: the files or their `.c8o-map.json` sidecars are not generated yet. Wait for `status: "ready"` and call it again; if there is still none, use the tree route (`convertigo://resources/convertigo-recipe-ngx-data-page`).
2. Read these files, and the global look (`src/app/app.component.scss`, existing toolbars and classes), before changing anything. Reading and editing these known paths is not a filesystem scan.
3. Call `palette-list` (and `palette-describe` for a component you use) for the parent you edit: write palette tags (`ion-button`, `ion-item`, `ion-card`, shared component selectors...) rather than generic HTML equivalents, so the import creates the real Convertigo components.
4. Edit the files (rules below). Import them before any tree change (`databaseobject-tree-apply`, delete, move, rename) of the same page or shared component: a tree change writes its files again, and the tools refuse it while they hold edits not imported.
5. Import: `project-reload(project=<project>, fromIonic=true, ionicTarget=<edited file, its .c8o-map.json, or the page/component folder>)`. With `ionicTarget` (relative to the project folder, or absolute), only that target is imported; without it, every sidecar of the project is. Both import into the loaded project, without a reload, save the project and write the generated files of what changed again.
6. Read the result before going on:
   - `status`: `imported_from_ionic`, `reloaded: true`. `unsupported`: this engine has no round-trip import.
   - `ionicReport.pagesUpdated`, `sharedComponentsUpdated`, `templatesUpdated`, `stylesUpdated`, `scriptsUpdated`: what was imported, and `changedObjects` the objects it changed. When the counts are all 0 after an edit, nothing was imported: the change is only in the file, the preview may show it, and the next generation loses it. Check the edit and the target, never report it as done.
   - `ionicReport.skipped > 0`: the HTML of a page or component could not be mapped to its existing tree; nothing of it was changed. Read the warning, restore the anchors or the structure it names, and import again, or make that change with the tree tools.
   - `ionicReport.warnings`: every warning is a change that was not applied (a scss that does not match its style components, a component of a referenced library, a removed header line...). Act on each one.
7. Prove the result: `mobile-builder-open` (compile state, viewer), then browser smoke as described in the frontend guides. The engine writes the files again after the import: read them again before a second edit. In the final answer, list what `ionicReport` imported.

## HTML rules
- Every generated element carries a `class<priority>` token (`class="title class1757510317683"`): it is the anchor of its Convertigo object. Keep it on the same element, never copy it to another element, never invent one, never move it. A token appears at most once in a file.
- Change an existing element in place: edit its attributes, classes and text, keep its tag when it is a palette tag. Add semantic classes next to the anchor (`class="crm-card class1776709259833"`).
- New elements have no anchor: the import creates their components and the next generation adds their anchors. An existing element can be wrapped in a new one (a row to put a button next to a title): its component moves inside, with its events and actions.
- Removing an element removes its component and its children.
- Attributes of palette components map to their properties: `fill="outline"` sets the `IonFill` property of an `ion-button`, removing the attribute unsets it. Write them as the Ionic docs do: a text as is (`header="About"`, `message="It's ready."`), an expression, a boolean or an array bound (`[buttons]="['OK']"`, `[backdropDismiss]="false"`). Classes rendered by a property (`ion-padding` of `ion-content`) stay in that property: removing the class unsets it, other classes go to the element's class attribute.
- Texts: write plain text or `{{ expression }}`; `{{ 'key' | translate }}` becomes a translated text.
- Structural directives: use `*ngIf`, `*ngFor`, `[ngSwitch]` / `*ngSwitchCase` / `*ngSwitchDefault` (on the element or on an `ng-container`). The block syntax (`@if`, `@for`, `@switch`) is not imported.
- Events: write the behaviour as a method in the `/*Begin_c8o_PageFunction*/` block of the page ts (`CompFunction` for a shared component) and call it from the html: `(click)="exportList($event)"`, `(didDismiss)="choose($event)"`, with `$event` or literals as arguments. The import creates the event and an action that calls the method. Keep the generated `ETS<priority>(...)` calls of existing events as they are: replacing one by a method call replaces its actions.
- Do not fake a capability in plain HTML/CSS (charts, maps, editors, calendars...) when a palette or marketplace component provides it: mount the real component.

## SCSS rules
- The scss of a page or shared component is generated from its style components: a `.class<priority> { ... }` block per styled element, then the styles of the page or component. Edit the lines of a block to change that element's style; the other lines keep their text.
- A new `.class<priority> { ... }` rule for an element of the file becomes a style of that element. Other new rules go to the nearest style of the page or component.
- Removing a whole `.class<priority>` block removes the styles of that element.
- A style for every page or component (all card titles, all buttons...) is one rule in `src/app/app.component.scss`, not one `.class<priority>` block per element: edit it inside its `/*Begin_c8o_style:<priority>*/ ... /*End_c8o_style:<priority>*/` blocks, or append plain new rules at its end (never write `Begin_c8o_style`/`End_c8o_style` markers yourself: the import creates the style and the next generation adds its markers), then import it (`ionicTarget` = that file). `src/global.scss` is not imported.

## TypeScript rules
- Only the bodies of the marker blocks are imported: `/*Begin_c8o_PageDeclaration*/ ... /*End_c8o_PageDeclaration*/` and the other `Page*` / `Comp*` markers, plus the `CTS<priority>` blocks of custom actions, and in a shared component the values of its `@Input() Name: any = value` lines, which are the default values of its variables. Other code outside the markers is regenerated and lost.
- In a method, `this` is the page or shared component: `this.getInstance(ToastController)` gives the Ionic controllers already imported by the file.
- Keep every marker line. Changing one block only updates that block.

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
