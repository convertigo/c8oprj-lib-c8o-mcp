# Binding modes and event rules

Read when: Binding modes and event rules. Summary: `convertigo://guides/data-page`.
Previous: `convertigo://guides/data-page/state-model`. Next: `convertigo://guides/data-page/failures`.

---

- Bind to business sequence contract fields such as `status`, `items`, `total`, `item`, `error`, or similarly deliberate names.
- Do not bind directly to raw HTTP or SQL shapes.
- If the requestable is stub-only, pass the runtime variable required to materialize the stub. For `probe_contract_stub`, that means `__stub=true`.
- When a `CallSequenceAction` output is the source of list/detail UI, prefer direct `SC` bindings from the action/business sequence source to page TypeScript copies. A `UICustomAction` that only does `page.items = response...` is a smell unless there is no usable source binding path.

### Event rules
- Put load behavior in the correct page event or explicit load chain.
- Put retry on a real button event backed by a real action chain.
- Avoid custom action calls for backend access when a built-in call sequence action exists.
- Avoid custom action response mappers when `SC` bindings can consume the call/business sequence output directly.
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
