# Runtime proof, stubs and common drift

Read when: Runtime proof, stubs and common drift. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/viewer`. Next: `convertigo://guides/ngx/completion-checks`.

---

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
- bind only to stable business sequence fields

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
- mobile builder was started early enough, preferably with `wait=false`, to expose real build issues while work continues
- logs were checked when the viewer/build path failed
- latest UI mutations were saved

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
- Do not build a contract-backed data page mainly through one large `UICustom` body.

