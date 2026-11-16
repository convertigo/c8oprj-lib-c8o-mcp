# Cards, labels and readable page structure

Read when: Cards, labels and readable page structure. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/design-finish`. Next: `convertigo://guides/ngx/page-structure`.

---

## Basic presentation

Wiring makes a page work; these patterns make it readable. Checked in a production build: each one renders as described. `ngx-page-create` builds list, detail, form and dashboard pages with them, and the logout page of an app that signs users in (see `convertigo-recipe-multipage-app`, Generators); apply them by hand to the pages it does not cover.

- Never put two `UIText` side by side for two pieces of information. Adjacent texts render on one line with no separator ("Active orders7", "ShippedDate: …"). Each piece goes in its own element: a `Label` and a `Note`, an `h3` and a `p`, two `span` blocks with classes, or one `UIText` that holds the whole sentence.
- Section: `UIDynamicElement#Heading2` with a `UIText` child, then the section content. Never a bare `UIText` as a title.
- List of records: `List` > `UIControlDirective` (`ForEach`) > `ListItem` > `Label` (`Heading3` for the main field, `Paragraph` for the secondary one) and a `Note` for the value shown on the right (date, status, amount). Never one `UIText` per row joined with " • ".
- Label and value (record details, form summary): a `List` with `lines` `none`, one `ListItem` per field, with a `Label` (the label) and a `Note` (the value).
- Counters or KPIs: a `DivTag` with a grid class holding one `DivTag` per counter (a card), each with an optional `Icon` and two `SpanTag`, the value and the label, each with its own class. Give each card an accent color that means something (danger for late, success for done).
- Record card: `Card` > `CardHeader` (`CardTitle`, `CardSubTitle`) > `CardContent` with the label/value list, then a `DivTag` with an actions class holding the `Button`s.
- Status: a `Badge` (or `Chip`) whose color follows the status (success, warning, danger, medium), next to the title, not glued inside a sentence.
- Empty state: an `Icon` and one sentence that says what is missing or what to do, in a `DivTag`, never a bare "No data".
- Write every visible text in the user's language with its accents (« Créer une commande », « Übersicht », « Configuración »). Convertigo objects are UTF-8 and accents render as typed; never strip them to ASCII. `project-lint` proofreads the shown texts and the i18n files and reports what is misspelled or missing its accents.
- A `UIText` with `i18n` true, such as the toolbar title of the starter page, is a translation key, not a text: without an entry in the app's i18n files the page shows the key with spaces turned into underscores (« Suivi_des_mises_a_jour… »). When you write the text yourself, set `i18n` to false in the same patch.
- The shared classes live in one app-level `UIStyle` named `AppLayout`, which `ngx-page-create` creates with its first page and completes with the rules each page uses: `app-page` (the page content), `app-title`, `app-section`, `app-list` (a list in a panel), `app-fields` (label/value), `app-table-head`, `app-row`, `app-cell` (a table), `app-kpis`, `app-kpi` with `app-kpi-icon` and `app-accent-<color>`, `app-badge`, `app-form`, `app-actions`, `app-empty-state`, `app-error`. On a page built by hand, use these classes; create `AppLayout` yourself only when no generated page made it. Write a CSS rule only for markup the tree really produces: `.counter b` styles nothing if the value is a bare `UIText`.
- A rule you write yourself reads the theme tokens (see Visual design) instead of fixed values: `padding: var(--app-space-4); border-radius: var(--app-radius); color: var(--app-muted)`.
- On an existing app, `project-brief` gives the style index: where each class is defined (`styles.classes[].definedIn`), the rules of the classes a page uses (with `page`), `styles.mainAppStyle` (the app style to complete) and the pages without a style of their own. Change a shared class in that app style, a style of one page in a `UIStyle` of the page, and use the `app-accent-<name>` classes and the theme variables before new colours (common skill, "Frequent changes: where they go", `convertigo://guides/common/existing-project`).

Wrap the page content in a `DivTag` with class `app-page`. A text-only Playwright proof does not see glued texts or a missing layout: look at the page itself (a screenshot) before calling a UI lot done.

Before you call a UI lot done, check each page you built, functionally and visually, with one verifier sub-agent run, `subagent-run({profile:"verifier", ...})` or its shortcut `browser-verify` (see Validation and evidence in the common skill, `convertigo://guides/common/proof`):
