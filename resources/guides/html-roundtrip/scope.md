# Files or tree: what this profile edits

Read when: Files or tree: what this profile edits. Summary: `convertigo://guides/html-roundtrip`.
Next: `convertigo://guides/html-roundtrip/workflow`.

---

# Convertigo NGX HTML Round-Trip

## When to read this
Read this in a conversation of the `html` edit profile, before a visual change of an existing NGX page or shared component: texts, markup, layout, classes, styles, small UI TypeScript. In this profile the generated HTML, SCSS and TypeScript of the pages and shared components (under `_private/ionic/src/app` of the project) are the authoring surface for that work: you edit them as files with your file tools, and `project-reload(fromIonic=true)` imports them back into the Convertigo objects. Outside this profile these files stay generated and are never edited.

## Files or tree
- Files: every visual change of an existing page or shared component, a new shared component made of markup and styles (its variables included), and placing a shared component on a page. This includes an alert, menu or dialog opened by a button: an inline `ion-alert`, `ion-action-sheet`, `ion-popover` or `ion-modal` with `trigger="<id of the button>"` needs no event nor action (a toast is the palette Toast action under the click event).
- Files also hold small behaviours (a click that prints, copies, opens or shows a message): a method of the ts called from the html, see the event rule below. The default values of the variables of a shared component (its labels and titles) are its `@Input()` lines.
- Tree: new pages, data sources, calls to sequences, action chains made of Convertigo actions (CallSequence, SetLocal, NavigatePage...), bindings to sequences, backend objects. Do the backend and data part with the tree tools first, then the visual part here. To give an element of the html an event or an action, find its object with `databaseobject-search` on the number of its anchor (`class1757510317683` is the object of priority `1757510317683`).
- Pages built by `upsert-ngx-crud-kit`: running the kit again rewrites its managed objects, whether they were changed in files or in the tree. For visual changes the kit cannot express, edit the files.
