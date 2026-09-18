## Skill freshness

- Skill guidance version: `{{GUIDANCE_VERSION}}`.
- During bootstrap, compare this value with `MCP guidance version` in `convertigo://capabilities`. If the MCP value differs or is missing, treat the installed skill and MCP endpoint as out of sync; rerun `{{SETUP_SEQUENCE}}` for the current MCP endpoint or ask before project mutation.
- When the caller surface supports MCP request metadata, send `params._meta.convertigoGuidanceVersion` with this skill guidance version on the first guarded Convertigo `tools/call`; raw HTTP clients may use the `X-Convertigo-Guidance-Version` header. An `_meta.convertigoGuidanceWarning` mismatch requires setup refresh before project mutation. A missing-version warning is advisory when this skill version already matches `convertigo://capabilities`: continue the current task and let the managed host refresh its transport configuration.

## MCP-first rule

- Convertigo MCP is the only authoring surface. Every inspection and every mutation goes through Convertigo MCP tools.
- Convertigo project descriptors are MCP-owned. Never read or edit `c8oProject.yaml`, `_c8oProject/**/*.yaml`, or `project.xml` as an authoring fallback. If a required MCP operation still fails after one targeted retry, stop and report the blocker without mutating project files.
- Never edit or repair `_private/ionic`, `DisplayObjects`, `dist`, or other generated artifacts. They are diagnostic-only surfaces; fix the Convertigo source objects or the MCP generator instead.
- Do not run `npm run build` or other manual frontend builds outside MCP to close a task.
- Do not use shell, PowerShell, `rg`, or filesystem scans to rediscover MCP tool signatures, installed skill files, or examples already exposed by callable schemas and named guides. Never recursively search a drive root, user profile, workspace root, or generated frontend tree for browser/build diagnostics; use `mobile-builder-open` and `log-view`.
- Treat the live MCP catalog as the public source of truth: `tools/list`, `resources/list`, `prompts/list`. Use catalog discovery only when this skill cannot route the task, a named resource is missing, or the MCP reports a guidance mismatch.

## Mandatory bootstrap

Bootstrap is required once per agent conversation for a given MCP endpoint and guidance version, not once per user message. On follow-up turns, reuse the skill, capabilities, and route guides already present in the conversation context. Do not reopen this skill, reread `convertigo://capabilities`, or reread an already-used guide unless the MCP endpoint changed, the MCP reports a guidance-version mismatch, or the required bootstrap context is explicitly unavailable.

1. Read `convertigo://capabilities` and verify the skill freshness rule above.
2. Select exactly one primary route in the table below before mutation and read only its required guides, in order. Read fallback guides only for a concrete unresolved question.
3. Do not call `rag-query` before the chosen guide was read and tried.
4. If the user explicitly wants MCP-only work, or the starting workspace is empty or non-relevant, do not inspect the local shell workspace before the MCP route decision is made.

## Task routes

{{TASK_ROUTES}}

## Tool economy and convergence

- Treat every tool round trip and large response as part of the task cost. Prefer targeted reads and request only the depth, properties, logs, or detail needed for the next decision.
- Do not repeat catalog, guide, palette, tree, builder, or browser reads whose answer is already present in the current conversation.
- Use `palette-list` to locate an unfamiliar object type and `palette-describe` only for properties that remain uncertain. Call `palette-list` with the exact intended parent QName as `target` and pass its returned logical `className` unchanged to `palette-describe`. Do not list at project scope and guess a `#logicalId`.
- A class/property shape already used successfully in the current conversation or returned by a targeted tree read is a confirmed contract. Do not reconfirm it through palette calls or tool-metadata inspection.
- Common NGX contracts that do not require palette discovery are `UIStyle#UIStyle.styleContent`, `UIAttribute#UIAttribute.attrName/attrValue`, `UIDynamicElement#TextItem`, `UIText#UIText.textValue`, `UIPageEvent#UIPageEvent.viewEvent`, and `UICustomAction#UICustomAction.actionValue`.
- For a fresh starter UI that uses only local page state or static content, one exact entry-page tree read is enough discovery for those common contracts. Skip `palette-list` and `palette-describe`, then perform the first coherent mutation immediately.
- Build one coherent mutation plan before the first write, then perform one targeted readback.
- For `databaseobject-tree-get`, use `childrenDepth` for recursive descendants and request the needed subtree once instead of walking one QName level per call. `depth` is accepted only as a compatibility alias.
- `databaseobject-tree-apply` always takes the target QName in `target`, never in `qname`. With `at:"inside"`, `tree` is the one concrete child being created and must include its own `className` and `name`; never submit a children-only wrapper. Put sibling creations in separate calls or batch entries.
- Property patches also belong under `tree`: use `databaseobject-tree-apply({target:"<qname>",mode:"merge",tree:{properties:{isEnabled:false}}})`. Never send `properties` beside `target`, because top-level `properties` is not a tree-apply argument.
- `databaseobject-tree-apply` with `mode:"replace"` and an empty or qname-only `children` does not delete anything. Delete exact nodes with `databaseobject-delete` and read back the parent to require the QName is absent.
- `mode:"merge"` updates properties but does not remove stale incompatible properties. When repairing an object whose shape changed, read it back and delete/recreate it if an incompatible property remains.

## Naming rules

- Use exactly the project name requested by the user when it is technically valid.
- If no project is selected and the user explicitly asks to create a new project or application without giving a technical name, derive one concise valid name from the requested product or function, check `project-list` for collisions, then proceed without asking the user to select a project.
- Do not invent prefixes, suffixes, or dates. If the requested name collides with an existing project, surface the collision explicitly instead of renaming.
- Inspect and mutate only the requested target project. Every QName you touch must start with that project name, except the single `marketplace-import` template id and `lib_ConvertigoMCP.*` resource reads. Do not target generic roots such as `Convertigo`, `WorkSpace`, `Projects`, or another project unless the user explicitly named a reference project.
- Do not create a project manually with `databaseobject-tree-apply`; project creation comes from `marketplace-import`.
- Every non-empty NGX `identifier` becomes an Angular/TypeScript reference and must match `[A-Za-z_$][A-Za-z0-9_$]*`, for example `clockDisplay`, never `clock-display`.

## Symbols and secrets

- Reference a Convertigo symbol with an explicit default value: `${my.symbol=defaultValue}`.
- Never write a bare symbol reference without a default. A bare reference fails project loading and there is no escape syntax.
- Never put a secret, token, password, API key, or customer credential in the default value. Keep the default a harmless placeholder and let the deployment provide the real value.
- Use `project-list-symbols` to discover the symbols a project already declares before inventing a new one.

## NGX authoring invariants

- Use the exact SmartType shape reported by the live palette or a successful readback. Do not invent aliases such as `JS`, `SCRIPT`, `PLAIN`, `expression`, or `value` interchangeably.
- Before changing a page `scriptContent`, read it with `properties:"all"`, preserve the complete existing string and every `Begin_c8o_...` / `End_c8o_...` section, and edit only the intended section. `mode:"merge"` replaces the whole string property; it does not merge script sections.
- Do not declare framework lifecycle methods such as `ngOnDestroy` in page `scriptContent` unless the live Convertigo contract explicitly provides that extension point. Use a supported page event for cleanup instead of guessing a generated method name.
- Every normal `UICustomAction` completion path must call `resolve(...)` or `reject(...)`; Convertigo wraps `actionValue` in a Promise and an unsettled action blocks its event chain even when TypeScript compilation is green. Use `UICustomAsyncAction` when the code contains `await`; plain `UICustomAction` code must not contain top-level `await`.
- For page state changed outside an Angular/Ionic event, such as timers, external callbacks, or third-party subscriptions, update `page.local` and call `page.ref.detectChanges()` in the same callback. Never use `this.c8o.page.detectChanges()`.
- Do not set labels by guessing `textValue` on every `UIDynamicElement`. Create the component with structural properties only, then create a child `ngx.components.UIText#UIText` for the visible text. A primary trigger without visible text is a failed UI proof.
- `directiveName:"ForEach"` does not define the template variable by itself. The root used by row text must be the `directiveItemName`: `{{ item.x }}` requires `directiveItemName:"item"`, `{{ record.x }}` requires `directiveItemName:"record"`. The nodes that interpolate that variable must be descendants of the `UIControlDirective`, not siblings. Read the directive back and verify `directiveSource`, `directiveItemName`, and `directiveIndexName`.
- Do not put a visibility condition on the same `UIControlDirective` as `ForEach`. Use a separate `If` directive whose `directiveExpression` is a raw Angular template expression.
- Bind page-local state with a Local SmartSource such as `?.results?.items`; do not write `{{ local?.x }}` in visible text. Angular interpolation in `UIText.textValue` is for iterator variables only.
- Scope page CSS to the element that actually paints the visible area. Do not assume a class or CSS variable crosses an Ionic shadow boundary; include background coverage in the first browser proof.
- For NGX shared actions or custom actions that need npm packages, declare dependencies on the action with `package_dependencies`; do not patch generated package files or rely on manual `npm install`. Keep import/dependency properties as nested XMLVector rows: imports are `[importClause, moduleName]`, dependencies are `[packageName, version]`, never a single CSV-like string.
- For `UICustomAsyncAction` code emitted in `actionbeans.service.ts`, put npm API imports in `app_ts_imports`.

## Backend invariants

- HTTP integration keeps transport in `HttpConnector` plus typed HTTP transactions; facade sequences call them with `TransactionStep` and only orchestrate or shape the public contract.
- Execute transactions through the runtime requestable path `<Project>.<Connector>.<Transaction>`, never the Studio QName `<Project>.cn:<Connector>.tr:<Transaction>`. `TransactionStep.sourceTransaction` uses the same runtime path.
- A facade that forwards a user query must expose a public `variables.RequestableVariable` on the sequence and a matching `StepVariable` under the `TransactionStep`. Keep the same object name across the HTTP transaction variable, the public facade variable, the `StepVariable`, and the UI variable.
- A facade proof is green only when the payload exposes an application contract such as `{items,total,query}` or an equivalent record array. `HttpInfo`, headers, `context`, `project`, and `sequence` are transport metadata, not application data.
- Do not replace a live web-service integration with a `SimpleStep`, hard-coded records, or a stub after a runtime failure. DNS, TLS, timeout, and provider 4xx/5xx are live proof failures, not tool failures: keep the rail and report the proof incomplete.
- Generated CRUD facade sequences are hidden requestables that require an authenticated context. The generated UI establishes that session once on a `Login` page that calls `auth_login(username,password)`.
- Prefer best-case-first generated code. Trust the standard runtime error bubble for ordinary failures instead of adding defensive wrappers by default.

## CRUD routing

- Do not ask the user to choose `upsert-crud`. Decide it yourself: use the CRUD rail only when the task is a standard SQL CRUD + starter NGX UI fit.
- Generic CRUD UI default: `ui.variant=entity-pages`. CRM-specific UI default: `ui.variant=master-detail`.
- New CRUD project rail: validate the name, `marketplace-import({project:"template_ngxBuilderIonic", importedProjectName:"<targetProject>"})`, `mobile-builder-open(wait=false)`, `upsert-crud`, backend `crud-proof`, `upsert-ngx-crud-kit stage=bootstrap`, `mobile-builder-open(stateOnly=true, wait=true)`, `upsert-ngx-crud-kit stage=final`, final `crud-proof(viewerUrl)`, `project-save`.
- Existing green CRUD project rail: `crud-status`, optional early `mobile-builder-open(wait=false)` when UI work is likely, `upsert-crud`, backend `crud-proof`, one `upsert-ngx-crud-kit stage=final`, `mobile-builder-open(stateOnly=true, wait=true)`, final `crud-proof(viewerUrl)`, optional `project-save`. Do not replay the new-project bootstrap.
- Treat `spec.relations[]`, `entities[].ui.relationFields`, and `seed.data` as first-class public CRUD inputs. Do not grep the local workspace to rediscover them once the CRUD guides were read. Prefer `seed.data` for demo rows instead of patching `init_schema` manually.
- For a low-detail CRUD request, stop after the first green end-to-end scaffold plus seeded demo data. Do not start a second UX or layout pass unless the user asked for it.
- The low-detail stop rule applies only to generic CRUD. Before mutation, list the explicit acceptance behaviors from the request. Filters, counters, domain actions, or dashboards are not proven by the presence of fields or a generic list/detail/form shell; implement and validate each one before claiming completion.

## Project review route

- Use this route when the user asks for a Convertigo project review, audit, expertise report, security/quality review, hardening plan, recommendations, client synthesis, or V1/V2 comparison.
- This route is static review by default. Do not mutate the project unless the user explicitly asks for fixes; label the limit as `static review only`, `static review plus runtime checks`, or `static review plus code changes`.
- Choose the mode first: `fresh review`, `progress review`, `client synthesis`, or `detailed expertise note`. If older reviews exist, prefer `progress review` and compare old recommendations against the current state before adding new findings.
- Frame the scope explicitly as backend only, frontend only, or both. Keep detailed backend and frontend conclusions separate first; merge only at synthesis level unless the user asks for one combined report.
- Inventory before judging. Backend inventory covers connectors, transactions, sequences, requestable exposure, references, authentication, administration, files/exports/mail, dynamic SQL, tests/debug/disabled nodes, and branch/tag governance. Frontend inventory covers pages, backend calls, shared components, shared actions, fragments, menus, disabled nodes, console logs, duplicated orchestration, old project references, and branch/tag governance.
- Reason from effective runtime exposure: absent `accessibility` means effectively `Public`; absent `authenticatedContextRequired` means effectively `false`. Recommend hardening targets such as `Public -> Hidden`, `Public -> Private`, and `false -> true`; do not recommend merely defining the property.
- Backend default stance: `Public` should be exceptional and deliberate; business sequences usually target `Hidden + authenticatedContextRequired=true`; internal helpers usually target `Private`; transactions should not remain directly requestable by convenience alone. Before recommending `Private`, map visible callers first.
- Frontend doctrine: fragments are a bad practice unless narrowly justified; large admin pages are architecture smells; repeated orchestration chains should become shared actions; reusable shared components may belong in a shared library.
- Build findings from direct evidence, ordered by severity. For each finding name the affected object, then state observed evidence, risk, and recommended target state.
- For V1/V2 comparisons, structure the review as: major V1 recommendations, current-state changes, `treated` / `partially treated` / `not treated` / `removed from the perimeter`, then new priorities.
- For client-facing reports, avoid repository jargon such as `YAML`, `_c8oProject`, descriptor, or file-level paths unless implementation detail is requested. Use audience terms: sequence, transaction, page, shared component, shared action, backend service, flow, exposure, access control, delivery governance.
- Suggested deliverables when files are requested: `revue_securite_qualite.md`, `revue_frontend_securite_qualite.md`, `synthese_client_backend_preconisations.md`, and `synthese_client_frontend_preconisations.md`; use `_v2` or `_v3` for explicit later passes.

## Viewer and mobile builder rule

- Starting the viewer is the agent's decision, not the user's. As soon as frontend work is known to be part of the task, call `mobile-builder-open` with `wait=false` so the viewer starts while you keep mutating.
- In dev, `mobile-builder-open` serves the live app from the viewer root. Prefer `viewerHomeUrl`, or fall back to `viewerBaseUrl`. In prod the application URL is `.../DisplayObjects/mobile/home`; do not open `DisplayObjects/mobile/...` against the live HMR viewer.
- Do not issue a state-only call before the first asynchronous launch. If the launch reports a Node download, npm install, or cold Angular build, finish useful mutations and make one waited call with `stateOnly:true, wait:true, timeoutSec:180` instead of repeated 30-second polls. Never wait with shell `sleep` or PowerShell delays.
- If a state-only call returns `status:"stopped"`, do not poll again: call `mobile-builder-open(stateOnly=false, wait=false)` once, continue other work, then poll readiness.
- Use browser control only after `mobile-builder-open` reports both `browserDebugPortMatched:true` and `browserControlReady:true`. A `browserControlTargetUrl` of `about:blank` means the loader is still building.
- Studio JxBrowser exposes one existing visible page over CDP, not a normal multi-tab browser. Reuse the current page; do not create, open, close, select, or navigate tabs.
- If the builder reports `browserControlReady:true` but the browser-control tools are missing, disabled, stale, or attached to another URL, stop the browser proof and report that the managed browser configuration must be refreshed. Do not work around it with Node scripts, raw CDP, or another browser.
- If `mobile-builder-open` reports `compile_error`, treat it as a source-object or generator issue and fix the Convertigo source. Do not patch generated runtime sources.
- If builder diagnostics are insufficient, make one focused `log-view({project:"<targetProject>",level:"error",limit:40,timeoutMs:0})` call. Do not issue separate error and warning scans, and avoid broad `log-view` in automation loops.

## Optional UI reveal mode

- If the host context says Convertigo reveal mode is enabled, pass `reveal:true` only on supported mutation/viewer tools that should visibly move Studio while you work: `databaseobject-tree-apply`, `mobile-builder-open`, `nocode-form-create`, `nocode-form-edit`, and `nocode-form-update`.
- If those mutations are grouped with `batch-call`, pass top-level `reveal:true`; the batch reveals the final touched object after its deferred refresh.
- Do not add `reveal:true` to read-only calls. For `mobile-builder-open`, use `wait:false` for reveal/focus polls and omit `reveal` on long readiness calls.
- Treat a `result.reveal.status` of `skipped`, `unsupported`, or `intent` as a UI hint, not as a mutation failure.

## Validation and evidence

- Treat `status:"partial"`, skipped properties, stale incompatible properties, failed operations, child patch errors, failed palette creation, and failed readback as failures to repair before continuing. If a partial create touched the UI tree, read back the affected root and delete or recreate the malformed child before adding more objects.
- Keep structural proof compact: normally `databaseobject-tree-get({target:"<changed-root>",childrenDepth:2,properties:"changed"})`. Do not combine a deep `properties:"all"` read with a waited builder call in one result.
- Validate backend behavior with `requestable-execute`, `crud-proof`, or `crud-status`, then persist once with `project-save` after a successful targeted readback.
- A browser proof should evaluate all relevant acceptance criteria together when practical: visible content, layout and style, interaction or timed state, and console/runtime errors.
- A single hydrated DOM sample proves only that the viewer rendered that state. For timers, live updates, interactions, or other changing behavior, require two observations showing the expected change or an equivalent browser-control assertion.
- If browser control is unavailable, report the result as implemented but functionally unvalidated. Do not claim success merely because compilation and server logs are green.
- Stop after the requested behavior is green. Do not add an unsolicited polish pass, do not restart broad verification, and do not repeat proof that cannot change the conclusion.

## Seed and visible data

- Prefer realistic seed data by default.
- Prefer semantic preview fields such as `name`, `title`, `city`, `email`, or `comment` over `id` when a visible choice exists.
