# Convertigo Frontend NGX

## When to read this
Read this when implementing or changing NGX pages, bindings, actions, route logic, or data-backed UI structure.

## What this guide covers
- Which NGX objects are indispensable and where they belong.
- How to place events and actions instead of scattering logic randomly.
- How to map backend data with SmartTypes, picker sources, and action variables.
- How to keep visible progress in Studio by starting the mobile builder early.

## Read this after the recipe
If the task is a classic data-backed page, read `convertigo/recipe-ngx-data-page@1` first. Use this handbook when the page needs deeper NGX structure, action chaining, runtime proof, or event semantics beyond the recipe.

## NGX mental model

### Structure first, then wiring
An NGX app is not only a tree of visual components. It is:
- route/page structure
- UI controls
- directives
- shared actions / action stacks
- event placement
- backend bindings

Good NGX work:
- picks a stable backend contract first
- creates the visible structure second
- wires actions and states third
- validates build/runtime before concluding

### Marketplace-first for optional capabilities
- Do not conclude that Convertigo lacks a feature just because the default palette is empty.
- When the user asks for a capability rather than a known class token, treat that as a marketplace-resolution trigger if the palette does not already expose an obvious built-in answer.
- Typical examples: charts/graphs, maps, barcode/QR, signature capture, PDF/document viewers, rich text editors, calendar/timeline/kanban, media widgets, diagramming.
- Preferred flow:
  1. read the target palette
  2. if no clear built-in object appears, call `palette-resolve-with-marketplace`
  3. pass intent-derived `search` / `filter` hints even if `className` is still unknown
  4. if a library is imported, continue from the refreshed palette result before editing descriptors
- uses `palette-json-skeleton` when the exact JSON mirror shape of one palette entry is needed, instead of mining other projects for examples, and reads `coverage` to know whether the subtree is template-backed, serialized, or hints-only
- treats the palette as incomplete until marketplace discovery/import has been checked for shared or external UI libraries

Common trap:
- creating a visually plausible tree with weak action wiring, then assuming the page is “done”

## Indispensable NGX objects

### Page/container level
Use explicit page/container structure for:
- top-level layout
- loading/empty/error sections
- list/detail structure

Do not hide the entire page logic inside one freeform custom fragment if the palette provides the right structural objects.

When a small custom or style object is still required (`UICustom`, `UIStyle`, directive wrapper, dynamic NGX component with tricky `beanData`), prefer this exact order:
1. resolve the real parent subtree
2. call `palette-json-skeleton`
3. adapt the returned JSON subtree locally
4. apply it to the target project

Do not search unrelated projects just to recover the raw JSON/YAML shape of those objects.

When a needed shared component/action or external UI object is missing from the palette, prefer this exact order:
1. call `palette-resolve-with-marketplace` with the target parent and the best available `library/search/filter` hints
2. if that composite tool is unavailable or insufficient, call `marketplace-list` with the target project context
3. inspect which libraries expose the needed shared components/actions
4. call `marketplace-import(targetProject=...)` if the matching library is not yet wired into the target project
5. reread the palette
6. only then conclude that a fallback object is required

Hard rule for data-backed pages:
- do not implement the primary page body as one large `ngx.components.UICustom#UICustom` with inline `htmlTemplate`
- reserve `UICustom` for tiny localized markup that native controls/directives cannot express safely
- if the page depends on backend data, action chains, retry, pagination, or lifecycle loading, the structure should stay visible in the NGX tree

### Data-loading action path
For a data-backed page, you usually need:
- one trigger/event
- one action stack
- one `CallSequenceAction` or `CallFullSync` path
- UI state updates around success/error/empty cases

### Retry path
Retry must be a real action path:
- not only a visible button
- not only a label
- not only a placeholder event with no backend call

The benchmark should be able to point to the actual action chain that retry executes.

## Where events and actions belong

### Event placement rules
Use events where user or lifecycle intent is clear:
- page enter/init when data must load on page arrival
- button/tap when the user retries, submits, or navigates
- explicit shared-action entry points when reuse is intended

Do not place events arbitrarily just because they are reachable in the tree.

Typical placements:
- page lifecycle events for first load or refresh-on-enter
- button or tap events for retry, submit, open detail, or confirm actions
- shared action stacks only when the same chain is reused from several entry points

### Common action chains
Sequence-backed chain:
1. trigger event
2. set loading state
3. call sequence
4. map success to page state
5. map empty result to empty state
6. map failure to error state
7. expose retry path

FullSync-backed chain:
1. trigger event
2. call fullsync action
3. normalize result into page state
4. preserve loading/empty/error semantics

Why this is the right way:
- page behavior stays predictable
- the agent does not invent one-off action trees every time

Common trap:
- calling the backend is the only thing wired; loading/empty/error/retry remain structural stubs

### Where sequence and fullsync calls belong
Use `CallSequenceAction` when:
- the page depends on a backend facade or server-side orchestration
- the contract already exists and the UI should consume it directly

Use `CallFullSyncAction` when:
- the page is working against synchronized local data
- offline/local query semantics are the right source of truth

Do not hide these calls inside arbitrary custom wrappers when a normal action stack already expresses the flow clearly.

## Data mapping with SmartTypes and picker

### Binding modes must be intentional
Frontend variables and action variables can carry:
- fixed text
- JS/TS expressions
- picker-based sources

Treat this as a real modeling choice, not an editor detail.

Use picker/source mode when:
- the data already exists in the current page/action context
- the source path is more stable than hand-written JS
- the value naturally comes from a sequence result, fullsync result, iterator directive, form, or global source

Use script mode when:
- the transform is small and obvious
- the page truly needs a computed expression
- the value is best expressed as a short TypeScript expression

Use text mode when:
- the value is fixed configuration
- the action variable is a deliberate literal such as a mode flag or static parameter

Rule of thumb:
- `TX` for fixed values
- `TS` for small local computation
- `SC` for data already present in the current action/page context

### Contract field mapping
Bind to stable facade contract fields:
- `items`
- `total`
- `status`
- `error`
- explicit detail fields chosen by the facade

Do not bind to raw connector names that only exist temporarily.

Common trap:
- UI binds to `rows`, `payload`, or source-specific names during early implementation and never gets cleaned up

### Action variables and data provenance
For `CallSequenceAction` and `CallFullSyncAction`, action variables are the normal handoff point between the event and the backend call.

Prefer:
- `TX` for constants and explicit flags
- `TS` for short expressions and reshaping
- `SC` when the picker can point directly to the current iterator item, form value, previous action output, sequence source, fullsync source, or global source

Why this matters:
- the current MCP surface is simpler than Studio's picker UI
- the guide must compensate by telling the agent when picker-backed sources are safer than handwritten expressions

## Common page pattern for data-backed UX

### Canonical order
1. contract known
2. page structure created
3. load action path wired
4. loading state visible
5. empty state visible
6. error state visible
7. retry path real
8. runtime/build checked

### Empty state
Use empty state for:
- valid request
- no data returned

Do not confuse empty state with error state.

### Error state
Use error state for:
- request failure
- invalid runtime path
- backend refusal

Error state must not silently masquerade as an empty list.

### Retry behavior
Retry must re-enter the data-loading action path. A structural marker is not enough.

## Mobile builder: use it early, not at the end

### Start it early on UX work
For any task that includes UI work, start `mobile-builder-open` early in the implementation path.

Why this is the right way:
- the user in Studio sees the application evolve live
- build errors surface earlier
- the agent stops guessing whether the tree is actually viable

### What to do when the viewer is unreachable
If `viewerUrl` is unreachable or browser smoke fails:
1. inspect the builder logs returned by `mobile-builder-open`
2. if still unclear, call `log-view`
3. decide whether:
   - the build failed
   - the viewer is unavailable
   - the page exists structurally but runtime proof is missing

Do not conclude success from tree shape alone when the build logs say otherwise.

### Structural success is not runtime success
Keep these checkpoints separate:
- structural success: the subtree and intended actions exist
- build success: the builder compiles the app
- runtime success: the viewer/browser path shows the expected behavior

If structural success exists but build/runtime fails, the task is not done. Read builder logs first, then `log-view` if needed.

If the builder is healthy and the page was changed, browser smoke is part of done-ness for UX work. “Builder ready” alone is not enough.

## Stub-backed UI runtime

### When `__stub=true` matters
If the page calls a requestable whose runtime proof depends on the Convertigo stub path, the UI action must pass `__stub=true` explicitly.

Why this matters:
- a stub file on disk is not enough by itself
- the browser path must ask for stub behavior explicitly when the requestable expects it

Common trap:
- the backend stub exists, but the UI runtime call still returns empty because the required variable was never sent

## Common NGX drift patterns

### Drift: raw backend payload binding
Symptom:
- page binds directly to source-specific response fields

Fix:
- bind only to stable facade fields

### Drift: structural retry only
Symptom:
- retry button exists, but no real action path is attached

Fix:
- ensure retry re-enters the same load action path

### Drift: build not checked
Symptom:
- tree looks plausible, but viewer/build fails

Fix:
- open mobile builder early and inspect logs

### Drift: custom wrappers/directives break semantics
Symptom:
- duplicated directive wrappers, empty containers, or invalid Angular composition

Fix:
- prefer palette-backed canonical structure
- keep directive/control composition deliberate

### Drift: giant UICustom body
Symptom:
- most of the data page lives in one `UICustom` / `htmlTemplate` node
- builder/runtime failures are hard to localize
- action wiring becomes implicit instead of inspectable

Fix:
- move the page back to native NGX controls, directives, and explicit action chains
- keep `UICustom` only for very small, isolated fragments

## Minimum validation proof
For a credible NGX data page:
- the target subtree exists
- bindings point to stable contract fields
- loading state exists
- empty state exists
- error state exists
- retry is a real action path
- mobile builder was started early enough to expose real build issues
- logs were checked when the viewer/build path failed
- latest UI mutations were saved

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `batch-call`
- `palette-list`
- `palette-describe`
- `palette-resolve-with-marketplace`
- `requestable-execute`
- `mobile-builder-open`
- `log-view`
- `project-save`

## Anti-patterns / do not do
- Do not guess NGX objects when the palette can tell you the canonical ones.
- Do not wait until the end to start the mobile builder on UX work.
- Do not ship only the happy path.
- Do not treat structural UI presence as runtime proof.
- Do not forget `__stub=true` when the requestable contract needs it.
- Do not build a contract-backed data page mainly through one large `UICustom` body.

## Completion checks
- The page uses deliberate NGX structure and action placement.
- Bindings target stable facade fields.
- Loading, empty, error, and retry states are all real.
- `mobile-builder-open` was started early on UX work.
- Builder or log evidence was read when runtime smoke failed.
- The page is saved only after structural and runtime/build evidence are consistent.
- A data-backed page is not implemented mainly through one large `UICustom` fragment.
