# SmartSource shapes, modes and directives

Read when: SmartSource shapes, modes and directives. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/form-submit`. Next: `convertigo://guides/ngx/action-data`.

---

## Data mapping with SmartTypes and picker

### Never write SmartSource JSON from memory
A SmartSource value is a JSON document whose internal keys depend on the filter (`Local`, `Form`, `Action`, `Iteration`, `Global`, ...), such as `priority`, `identifier`, or `localObject` in `model.data`. A hand-written value that misses one of them may still compile and fail to bind, or bind to the wrong object.
- Always start from an existing valid SmartSource: read one back with `databaseobject-tree-get` (`properties:"all"`) from a node of the same project that already uses that filter, or copy it from Studio.
- When the project has no SmartSource of that filter yet, use the canonical shape documented in this guide for that filter (Local, Form), apply it once, read it back, and use that readback as the model for the next ones.
- Reproduce its exact shape and key order, and change only the values that identify your target (priority, identifier, path).
- Priorities come from the `priority` field of the target node in `databaseobject-tree-get` output and are JSON numbers inside `model.data`.
- After each apply, read the node back and compare the stored SmartSource with the shape you copied.

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

Priority rule:
- Prefer `SC` over `TS` when sourcing data from `CallSequenceAction` output, a business sequence source, a previous action output, an iterator item, a form control, or global/page context that the picker can address.
- Use `TS` only when the value is not directly sourceable or when a small local expression is genuinely clearer than the picker path.
- Do not copy a full sequence response into page TypeScript state just so the template can iterate it. Bind list/detail components directly to the business sequence/action source with `SC` whenever the source can be expressed in the tree.

### Contract field mapping
Bind to stable business sequence contract fields:
- `items`
- `total`
- `status`
- `error`
- explicit detail fields chosen by the business sequence

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

### Structural directives and scope
Use palette structural directives for Angular structural behavior:
- Use `UIControlDirective#UIControlDirective` with `directiveName=ForEach` for repeated UI.
- Use `directiveItemName` and `directiveIndexName` so Convertigo owns the generated scope.
