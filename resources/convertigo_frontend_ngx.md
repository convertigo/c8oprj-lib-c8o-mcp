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

Common trap:
- creating a visually plausible tree with weak action wiring, then assuming the page is “done”

## Indispensable NGX objects

### Page/container level
Use explicit page/container structure for:
- top-level layout
- loading/empty/error sections
- list/detail structure

Do not hide the entire page logic inside one freeform custom fragment if the palette provides the right structural objects.

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

## Data mapping with SmartTypes and picker

### Binding modes must be intentional
Frontend variables and action variables can carry:
- fixed text
- JS/TS expressions
- picker-based sources

Use picker/source mode when:
- the data already exists in the current page/action context
- the source path is more stable than hand-written JS

Use script mode when:
- the transform is small and obvious
- the page truly needs a computed expression

Use text mode when:
- the value is fixed configuration

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

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `batch-call`
- `palette-list`
- `palette-describe`
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

## Completion checks
- The page uses deliberate NGX structure and action placement.
- Bindings target stable facade fields.
- Loading, empty, error, and retry states are all real.
- `mobile-builder-open` was started early on UX work.
- Builder or log evidence was read when runtime smoke failed.
- The page is saved only after structural and runtime/build evidence are consistent.
