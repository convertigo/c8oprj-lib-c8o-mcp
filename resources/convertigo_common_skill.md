## Skill freshness

- Skill guidance version: `{{GUIDANCE_VERSION}}`.
- Compare once per agent conversation with `MCP guidance version` in `convertigo://capabilities`. If different, rerun `{{SETUP_SEQUENCE}}` for this endpoint before mutation. An `_meta.convertigoGuidanceWarning` mismatch requires refresh. A missing transport version is advisory when the installed version matches.
- Send `params._meta.convertigoGuidanceVersion` or `X-Convertigo-Guidance-Version` when supported.

## MCP-first rule

Use Convertigo MCP for inspection and authoring. Never edit `c8oProject.yaml`, `_c8oProject/**/*.yaml`, `project.xml`, `_private/ionic`, `DisplayObjects` or `dist`. Fix source objects or generators. Do not run manual frontend builds. Do not scan the filesystem to rediscover MCP contracts. Read named URIs directly; discover catalogs only for ambiguous routing, missing entries or version mismatch.

Keep the exact requested project name and target project. New NGX projects use `marketplace-import` with `template_ngxBuilderIonic`; open the viewer with `wait=false` early. Standard marketplace libraries are platform components: use the `_ui_ngx` variant for NGX. Before the first project mutation, inventory capabilities and reuse existing libraries; read `convertigo://guides/common/libraries` for the capability table.

Inspect with `databaseobject-tree-get`, mutate with `databaseobject-tree-apply`, order dependent writes in `batch-call`, prove through `requestable-execute`, and persist with `project-save`. Check `result.error`, partial mutations and skipped properties. Use structured objects/arrays; use generated `callsFile` for large lots. Details: `convertigo://guides/common/batching` and `convertigo://guides/common/readback`.

A file the user attached in the Tigo panel (a spreadsheet, CSV, PDF, Word or text file) is read with `attachment-read` `{name}`: its sheets and rows, or its text, a page at a time with `offset`.

## Existing project: notes and brief first

A change to an existing project starts from its notes (`_private/docs/PROGRESS.md`, never served, or `docs/generated/PROGRESS.md` until `project-notes-write` moves them; given at the start of the turn as `Project notes kept by Tigo`) and `project-brief({project})`, then `project-brief({project, page})` for each page you change: patch from the QNames it shows instead of searching or reading whole pages; keep `databaseobject-search`, `databaseobject-tree-get` and `palette-*` for what the brief does not answer. Where frequent changes go (shared and page styles, colours, KPI cards, list columns, links in rows, texts): `convertigo://guides/common/existing-project`.

## Task routes

Select exactly one primary route before mutation. Read its summary and only the drawer needed for the current step; fallback only for an unresolved question. On follow-up turns reuse already-read guidance. Do not use RAG before trying the route.

{{TASK_ROUTES}}

## Essential authoring rules

Backend: keep transport in typed transactions and call them through `TransactionStep` using runtime paths, never Studio QNames. Preserve public variable names end to end. Prove application data, not just status or metadata. Never replace a failed live service with sample data. Details: `convertigo://guides/common/backend`.

NGX: calls use events/actions and SC locals, never `scriptContent`/`c8o.callJson`. Sibling actions run in parallel; children await the parent. Check business `out.error` explicitly. Preserve the complete scriptContent and marker sections. Resolve/reject every custom action path. Forms use UIForm > FormItem > control with ControlName, Label and LabelPlacement. Never write SmartSource JSON from memory; copy a valid shape including the Form priority. ForEach needs matching directiveItemName and descendant rows. Details: `convertigo://guides/common/ngx`, `convertigo://guides/ngx/forms`, `convertigo://guides/ngx/smartsource`.

## Symbols and secrets

Symbols require harmless defaults: `${my.symbol=defaultValue}`. Secret `visibility` is 15 (Logs=1, Studio=2, Platform=4, XmlFile=8); never ship credentials in defaults or logs. Details: `convertigo://guides/common/names-secrets`.

## Authentication route

Use standard libraries for accounts/SSO. Generated CRUD `auth_login` accepts any password until replaced. Enforce authentication and roles server-side; hidden exposure alone is insufficient. Details: `convertigo://guides/common/auth`. Seed writes check every call and must be private or authenticated with a role check; prove idempotence and real login, with no literal demo password. Details: `convertigo://guides/common/seed`. To check pages behind the sign-in in a Studio, use `viewer-sign-in` (or `browser-verify` with `signInAs`), without a password. Never guess, try or reset a password, read password hashes, or create an account to get past a sign-in: ask the user for the account.

## Proof and long tasks

A green tree/build is not functional proof. Open the managed viewer early, check readiness, verify visible acceptance criteria and normal/empty/error states, run `mobile-builder-build` before deployment/export, then save. Without browser proof report implemented but functionally unvalidated. Never repair generated files or claim unperformed proof. Read `convertigo://guides/common/viewer` for builder/browser trouble and `convertigo://guides/common/proof` before final proof. Act on verifier findings: `convertigo://guides/common/proof-results`.

Keep the project notes current with `project-notes-write` at the end of each lot of a build (conventions, inventory, proofs, next step; never a password) and start every resume from them and `project-brief`: `convertigo://guides/common/progress`. Every build document goes under `<project>/_private/docs/`: a server serves every other project folder, `docs/` included, to anyone. Generate payload files in the temporary folder of this conversation (each turn names it: `Temporary folder of this conversation: <path>`). Never wait with shell `sleep`; use the managed tool state. Before delegating constructor lots or verifier checks, read `convertigo://guides/common/subagents`. Stop after the requested behavior is proved; report gaps explicitly.

`operatorNote` is a note from the person who supervises your work: read it before continuing, apply it within the task and keep higher-priority constraints.

For reviews read `convertigo://guides/common/review`; for user-requested Tigo prompts/skills/MCP connections read `convertigo://guides/common/tigo` before editing configuration. Use secret references, preserve revisions, and require the Settings confirmation for a saved MCP proposal.

All specialised drawers: `convertigo://guides/common`.
