# When to escalate to references

Read when: When to escalate to references. Summary: `convertigo://guides/backend`.
Previous: `convertigo://guides/backend/schema-learning-when-mapping-matters-3`.

---

## When to escalate to references
Read `convertigo://guides/context` when:
- a script touches `context`
- you need to know what the platform already exposes and what not to invent

Read `convertigo://resources/convertigo-json-quickref` when:
- you need JSON step names or fast reminders
- you need quick iterator/order/source reminders without reading the full handbook again

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `batch-call`
- `databaseobject-schema`
- `requestable-execute`
- `requestable-stub-get`
- `requestable-stub-set`
- `log-view`
- `project-save`

## Anti-patterns / do not do
- Do not use direct YAML edits as the normal path for MCP-driven work.
- Do not build the public contract inside one opaque script if explicit steps can shape it.
- Do not store business state in custom `context.*`.
- Do not let connector transactions become the public API.
- Do not guess source picker paths.
- Do not postpone runtime validation until the whole backend is “finished”.

## Frequent failure modes

### Failure mode: contract locked too late
Symptom:
- field names move while implementation progresses

Fix:
- lock nominal and error top-level fields before deep implementation

### Failure mode: source picker points at the wrong node
Symptom:
- empty or surprising text values

Fix:
- inspect the producer result and point at the exact text or node needed

### Failure mode: raw connector leakage
Symptom:
- public payload exposes row names, XML nodes, or transaction-only metadata

Fix:
- always remap into explicit business sequence JSON steps

### Failure mode: Rhino script does too much
Symptom:
- sequence works once, then becomes hard to reason about or breaks under slight variation

Fix:
- reduce script scope and move public shaping back into explicit steps

### Failure mode: helper steps accidentally define output
Symptom:
- response shape changes after internal refactor

Fix:
- keep output-bearing steps deliberate and minimal

## Completion checks
- The backend sequence tree is readable and intentional from `databaseobject-tree-get`.
- Public inputs and top-level outputs are explicit.
- Source picker and SmartType choices are justified, not guessed.
- Business sequence and helper responsibilities are distinct.
- `requestable-execute` proves the nominal path.
- `requestable-execute` proves at least one empty/error or alternate path.
- The final public contract remains stable after orchestration changes.
For generated CRUD projects, apply that split with Convertigo accessibility:
- business sequences consumed by the app are typically `Hidden`
- internal helpers stay `Private`
- only intentionally public HTTP endpoints should be `Public`
