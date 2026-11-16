# Convertigo Frontend NGX

Use palette-modeled NGX objects, not a UICustom page body. Backend calls belong in events and CallSequenceAction, never scriptContent/c8o.callJson. Sibling actions run in parallel; make B a child of A to await its result. Store out before entering an IfAction. Business errors returned as out.error need an explicit test. Use UIForm > FormItem > control with ControlName, Label and LabelPlacement; copy a valid Form SmartSource including priority. Never write SmartSource JSON from memory. Use SC/local bindings for page state and interpolation for iterator variables. ForEach needs directiveItemName and descendant rows. Preserve every scriptContent marker; resolve/reject every UICustomAction path. Fix source objects, never generated files. Open the viewer early and prove visible behavior before project-save. Before deployment/export run mobile-builder-build; a green dev viewer alone is insufficient.

## Drawers
- `convertigo://guides/ngx/orientation` — Choose the NGX recipe and handbook.
- `convertigo://guides/ngx/palette` — Palette structure and source-object rules.
- `convertigo://guides/ngx/components` — Palette component names and visual design.
- `convertigo://guides/ngx/design` — Deliberate layouts and visual review.
- `convertigo://guides/ngx/design-finish` — Visual finishing pass of the pages.
- `convertigo://guides/ngx/presentation` — Cards, labels and readable page structure.
- `convertigo://guides/ngx/page-structure` — Viewer proof, pages and action paths.
- `convertigo://guides/ngx/events` — Action execution order and business errors.
- `convertigo://guides/ngx/http-search` — HTTP search page input and state.
- `convertigo://guides/ngx/http-results` — Application contract and result mapping.
- `convertigo://guides/ngx/navigation` — Noncompliant calls and page navigation.
- `convertigo://guides/ngx/forms` — Forms, labels, validation and Form SmartSources.
- `convertigo://guides/ngx/form-submit` — Existing form data and submit chains.
- `convertigo://guides/ngx/smartsource` — SmartSource shapes, modes and directives.
- `convertigo://guides/ngx/action-data` — Iterator scope and data along action chains.
- `convertigo://guides/ngx/custom-actions` — Cache, expression contexts and custom actions.
- `convertigo://guides/ngx/dependencies` — NPM dependencies and common data-page states.
- `convertigo://guides/ngx/viewer` — Builder launch and managed browser control.
- `convertigo://guides/ngx/proof` — Runtime proof, stubs and common drift.
- `convertigo://guides/ngx/completion-checks` — Completion checks.
