# Existing project: notes, brief and frequent changes

Read when: Existing project: notes, brief and frequent changes. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/libraries`. Next: `convertigo://guides/common/batching`.

---

## Existing project: notes and brief first

A change to a project that already exists starts from what the project says about itself, not from a walk of its tree. Agents spent most of a one-column change searching for the page, reading it whole and looking for where a class was defined.
- The notes of the project (`docs/generated/PROGRESS.md`) open the turn when it has them (`Project notes kept by Tigo`) and come in `project-brief`: follow their conventions.
- Call `project-brief({project})` once: the pages (route, sequences called, pages opened, main components), the sequences and who can call them, the tables and their fields, the sign-in and the roles, the references, the style index (each class the pages use and where it is defined) and the notes. Then `project-brief({project, page:"<Page>"})` for each page you change: one line per object with its QName suffix, classes, texts, bindings, events and actions, and the CSS rules of the classes it uses (`classes:[...]` adds others).
- Patch from those QNames with `databaseobject-tree-apply`: the QName of an object is the page QName, a dot, and the path at the start of its line. Do not search for the page, tree-get the whole page, or read the palette for an object type the page already uses; copy its shape from the line.
- Keep `databaseobject-search`, `databaseobject-tree-get` and `palette-*` for what the brief does not answer: a value it cuts, an object type the project does not use yet.

## Frequent changes: where they go

- A style shared by several pages goes in the app style the brief names (`styles.mainAppStyle`, usually `AppLayout`), in its `styleContent`, next to the rules of the same classes; a style of one page goes in a `UIStyle` child of that page (create it when the page has none). Never inline `style` attributes, never a page style for a class every page uses.
- Colours: the existing classes and variables first. An accent is an `app-accent-<name>` class (`primary`, `secondary`, `tertiary`, `success`, `warning`, `danger`, `medium`) that sets `--app-accent` and `--app-accent-rgb`; a soft background reads them, `rgba(var(--app-accent-rgb), 0.1)`; theme colours are `var(--ion-color-<name>)` and `var(--ion-color-<name>-rgb)`. Add a colour class only when none fits, in the app style next to the others. A class a page uses must be defined somewhere: `styles.undefinedClasses` lists the ones that are not.
- KPI cards: `.app-kpis` is the grid of the cards and `.app-kpi` one card: the columns go on `.app-kpis` (a media query for small screens), the look of a card on `.app-kpi`, the colour of one card through its `app-accent-<name>` class.
- A column in a list page: its header cell in the head row and its value cell in the row cells, in the same position, with the same `app-cell` class and `data-label`, then `app-cols-<N>` set to the new count on both rows (the app style defines them up to 8). Check first that the page's sequence returns the field (`sequences` and `data` of the brief).
- A link or a button inside a clickable row: the click must not also run the row's action. Give the element an attribute `(click)` whose value is `$event.stopPropagation()` (a `UIAttribute`, mode SCRIPT); a link is an `a` element with `href`, `target` `_blank` and `rel` `noopener noreferrer`.
- A text, a label or a column title: the `UIText` of the line the brief shows, nothing else.
- When the change decides a convention the notes do not hold (where a kind of style goes, a naming rule), add one line to the notes with `project-notes-write` (mode append) at the end, unless the user said to change nothing else in the project.
