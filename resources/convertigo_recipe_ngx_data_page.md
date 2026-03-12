# Convertigo Recipe: NGX Data Page With Stable Contract States

## When to read this
Read this when building a page that loads backend data and must behave correctly on initial load, empty data, errors, and retry.

## What this guide covers
- The fastest safe NGX page pattern for data-backed UI.
- How to wire load, empty, error, and retry states.
- How to bind to stable facade fields.
- How to validate both structure and runtime behavior.

## Mandatory workflow

### Golden path
1. Confirm the backend facade contract first.
2. Inspect the target page subtree and identify the actual visible entry page.
3. On starter-derived apps, replace the dominant starter body on the visible entry page first. Do not keep `WelcomeCard` or equivalent demo content as the main visible body while other work continues.
4. The first visible pass must already make the real entry page look alive:
   - title/header changed
   - starter body replaced
   - one visible feature section exists
   - loading, empty, or retry states are visible
   - one contract-shaped slot exists for the eventual live count/item binding
5. If stable facade proof already exists, bind one real count, value, or repeated item in that first pass. Otherwise treat this as `phase 1` shell progress and return for a second binding pass after backend proof.
6. Use the palette or canonical tree shapes to create:
   - visible feature shell that replaces the default starter content early
   - first visible write on the actual visible entry page; for starter-derived projects this usually means replacing the dominant body under `Page.Content`
   - page load event
   - state flags
   - success container
   - empty state
   - error state
   - retry action
5. Use `CallSequenceAction` or the equivalent built-in action for backend calls.
6. Bind only to stable facade fields.
7. Keep the main page body on native NGX objects. Do not collapse a data page into one large `UICustom` / `htmlTemplate` fragment.
8. Stay inside the target project. Do not trawl unrelated workspace pages or YAML files for ready-made directive trees unless the task explicitly provides a read-only example project.
9. Start the mobile builder early and treat builder/browser proof as part of the recipe, not as an afterthought.
10. Save after structural and runtime checks.
11. One targeted read, then visible mutation. A pass that only reads, saves, opens the builder, or repeats broad palette discovery without replacing the dominant starter content is a no-op.
12. For starter-derived projects, a pass that creates only a secondary page while the visible entry page still shows the untouched starter body is also a no-op unless the entry route was deliberately switched, saved, and proven.

### First visible shell for common demos
On the first pass, build the smallest shell that already looks like the requested feature:
- real page title
- one visible list/card/table container
- one loading, empty, or retry state tied to the stable contract or stub
- one contract-shaped slot or placeholder surface for the eventual live count/item
- one obvious action such as retry, refresh, or create

This first shell is intentionally repetitive. It should be built almost mechanically from the recipe for common CRUD/list pages.
Once backend proof exists, the second pass replaces the placeholder surface with one real bound count, value, or repeated item.

### Literal fast-path template
For starter-derived apps, use `convertigo://resources/convertigo-fast-path-ngx-entry-shell` as the default first-pass template.
Do not redesign the first visible shell from scratch when that template already matches the task.

### Canonical state model
For a typical page-local state, keep explicit flags:
- loading
- empty
- error
- last payload or resolved contract fields

The exact object tree may vary, but the semantics must be explicit.

### Binding rules
- Bind to facade contract fields such as `status`, `items`, `total`, `item`, `error`, or similarly deliberate names.
- Do not bind directly to raw HTTP or SQL shapes.
- If the requestable is stub-only, pass the runtime variable required to materialize the stub. For `probe_contract_stub`, that means `__stub=true`.

### Event rules
- Put load behavior in the correct page event or explicit load chain.
- Put retry on a real button event backed by a real action chain.
- Avoid custom action calls for backend access when a built-in call sequence action exists.
- Avoid one big `UICustom` fragment as the main implementation path for a data page.
- Avoid “reference hunting” across the workspace to recover `directiveSource` snippets or wrapper placement from unrelated projects. If recipe + palette + target subtree are not enough, escalate the gap instead of copying opaque structures.
- Avoid repeated `palette-list` loops for common page primitives after the first targeted read.

### Why this is the right way
- The UI becomes stable before the real integration is fully complete.
- Studio shows visible feature progress early instead of an untouched starter page.
- Retry, empty, and error behavior are first-class, not late add-ons.
- Build/runtime validation becomes much easier because the page state is explicit.
- Native NGX trees survive builder/runtime checks better than large inline custom markup.

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
- Do not bind the page to raw connector output.
- Do not use custom code when palette-backed actions can express the same flow.
- Do not ship only the success path.
- Do not assume a stub file on disk means the page will see the stub payload automatically.
- Do not mark the page done if the latest UI mutations were never saved.

### Common failure modes
- Page loads before the contract is stable.
- Retry button exists structurally but has no real action chain.
- Stub-only requestable is called without `__stub=true`, then the page looks empty.
- Browser smoke fails, but build logs are never inspected.
- Builder is healthy, browser smoke is skipped, and the run still claims success.
- The builder opens, but the dominant visible page is still the untouched starter template.
- A secondary page was created, but the default visible entry page still shows the untouched starter body.
- A large `UICustom` body hides the actual page structure and makes build failures harder to localize.
- The agent spends many turns reading other workspace projects instead of mutating the target page with the known recipe.
- The agent opens the builder or saves repeatedly before making the first visible page mutation.

## Minimum validation proof
- `requestable-execute` proves the facade contract.
- Tree readback proves loading, empty, error, and retry nodes/actions exist.
- `mobile-builder-open` proves build readiness or exposes the build error.
- Browser smoke proves the happy path when the builder is healthy.
- Save must succeed after the final UI mutation.

## Completion checks
- The target page binds to a stable facade contract.
- Loading, empty, and error states are explicit.
- Retry is a real action, not a visual placeholder.
- Static placeholder labels such as `Contacts list placeholder` or `Companies list placeholder` do not count as a usable UX milestone.
- Runtime validation covers the same contract the UI binds to.
- The latest NGX mutations were saved.
