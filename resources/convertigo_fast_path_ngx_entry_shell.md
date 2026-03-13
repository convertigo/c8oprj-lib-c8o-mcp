# Convertigo Fast Path: Starter Entry Page Replacement

## When to use this
Use this fast path when a starter-derived NGX project still shows the default visible entry page and the first frontend milestone is to make the app look alive immediately.

## Fast-path id
- `starter-entry-page-replacement`

## Scope
Drive the first frontend pass mechanically:
- inspect the visible entry page subtree once
- create shared CRUD components under `Application.NgxApp`
- replace the dominant starter body under `Application.NgxApp.Page.Content`
- compose the visible page with `UIUseShared` + `UIUseVariable`
- only then save, build, and browser-smoke

Prefer `upsert-ngx-crud-kit` when the task matches this exact starter-derived CRUD/dashboard shell envelope. Hand-build the first-write subtree only when the caller explicitly cannot use the deterministic tool.

## Allowed variables
Only parameterize these placeholders:
- `<PROJECT_NAME>`
- `<PAGE_TITLE>`
- `<ENTITY_ONE_LABEL>`
- `<ENTITY_TWO_LABEL>`
- `<REQUESTABLE_NAME>`

## Primary target
- `<PROJECT_NAME>.Application.NgxApp.Page.Content`

## Canonical first-write shape
The first pass should create entity-specific shared components under `Application.NgxApp`, then replace `WelcomeCard` or equivalent starter content with a page assembled through `UIUseShared`. Use the deterministic kit literally when available. Do not start with `batch-call`, a preliminary delete, or broad palette discovery.

```json
{
  "sharedComponents": [
    "Application.NgxApp.DashboardStatCard",
    "Application.NgxApp.CrudLoadingState",
    "Application.NgxApp.CrudErrorRetryState",
    "Application.NgxApp.ContactTable",
    "Application.NgxApp.CompanyTable"
  ],
  "entryPage": {
    "target": "Application.NgxApp.Page.Content",
    "composition": [
      "UIUseShared(DashboardStatCard)",
      "UIUseShared(ContactTable)",
      "UIUseShared(CompanyTable)",
      "UIUseShared(CrudLoadingState)",
      "UIUseShared(CrudErrorRetryState)"
    ]
  }
}
```

## Visible shell requirements
The first visible shell must include:
- a real feature title, not the starter title
- a short subtitle or caption explaining the feature
- at least one obvious content container for the main entity
- at least one contract-shaped data slot or placeholder surface ready to host the public facade fields
- one visible loading, empty, or retry state
- one obvious action such as retry, refresh, or create

For a `MiniCRM`-style shell, the first visible pass can be as small as:
- title: `Mini CRM`
- subtitle: `Contacts and companies`
- one `ContactTable` shared component instance with a reserved live-count or first-item slot from `list_contacts`
- one `CompanyTable` shared component instance with a reserved live-count or first-item slot from `list_companies`
- one loading/empty placeholder bound to the stub contract

## Two phases
- `phase 1`: visible shell now. Replace the starter body, make the page visibly feature-shaped, and leave contract-shaped placeholders/loading states if live data is not proved yet.
- `phase 2`: live bindings. Once backend proof exists, replace placeholder copy with one real count, item, or repeated row/card from the public facade and collect browser smoke.

## Contract-backed proof rule
The first visible pass is incomplete if it stops at untouched starter content.  
The overall UX flow is incomplete if it stops forever at static copy such as:
- `Contacts list placeholder`
- `Companies list placeholder`

Before claiming the fast path complete, the page must show at least one real value that came from the stable public facade contract or the verified stub response.

## First proof sequence
1. `upsert-ngx-crud-kit` creates shared components under `<PROJECT_NAME>.Application.NgxApp`
2. `crud-status` proves `starterDominant == false` and `visibleShellPresent == true`
3. `databaseobject-tree-get` on `<PROJECT_NAME>.Application.NgxApp.Page.Content` proves the page uses `UIUseShared`
4. `project-save`
5. `mobile-builder-open`
6. if facade proof already exists, `requestable-execute` on the public facade plus one real bound value on screen
7. browser smoke only after the visible shell exists

## Do not do on first pass
- do not create only a secondary page
- do not keep the starter `WelcomeCard` as the main visible body
- do not inline-build the whole first-pass CRUD page if `upsert-ngx-crud-kit` is applicable
- do not loop on `palette-list`
- do not use `batch-call` or a separate `databaseobject-delete` just to remove `WelcomeCard`; replace the dominant starter body by applying the first-write shape directly on `Application.NgxApp.Page.Content`
- do not use `databaseobject-search`, `rag-query`, or repeated `palette-describe` calls before the first direct `databaseobject-tree-apply`
- do not improvise a different first-pass subtree shape when this template already fits
- do not browse other projects for `directiveSource` or YAML snippets
- do not save/build before the first visible mutation
- do not declare overall UX complete with only a static shell and placeholder text

## Expected specialist output anchors
- `Primary Target`: `<PROJECT_NAME>.Application.NgxApp.Page.Content`
- `Fast-Path Used`: `starter-entry-page-replacement`
