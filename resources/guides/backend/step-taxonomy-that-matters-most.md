# Step taxonomy that matters most

Read when: Step taxonomy that matters most. Summary: `convertigo://guides/backend`.
Previous: `convertigo://guides/backend/overview`. Next: `convertigo://guides/backend/step-taxonomy-that-matters-most-2`.

---

## Step taxonomy that matters most

### 1. Flow control steps
These control when logic executes and when the sequence should stop.

Core family:
- `If`, `IfThenElse`, `IfExistThenElse`
- `Iterator`, `XMLCopyStep`, `Sort`, `Return`
- loop constructs when iteration is really required

Use them to:
- branch on missing input or missing data
- iterate over source rows/items deliberately
- stop early when the business sequence already has enough evidence to return

Pick the loop by what you iterate:
- a JavaScript array or list built in a `SimpleStep` (rows from `sql_output`, ids split from a variable): `steps.SimpleIteratorStep` (jIterator) with `expression` set to it (`orders`, `rows || []`); its child steps read the current element as `item` and its position as `index`. Its `condition` is the stopping index, not a filter: filter with an `IfStep` inside the loop.
- an XML node list of a source step: `steps.IteratorStep` with a `sourceDefinition` on that step. Given a JavaScript variable, it runs zero times without any error.

Why this is the right way:
- explicit flow steps make the orchestration readable in tree form
- source picker and output behavior stay visible
- critics and future maintainers can reason about the sequence without reverse-engineering a large script

Common trap:
- pushing all conditional flow into one `SimpleStep` with many side effects, then losing traceability and sourceability

Minimum validation proof:
- `requestable-execute` covers the happy path
- `requestable-execute` covers one missing/empty/error path
- the final business sequence output changes only where the contract says it should

### 2. Sequence and transaction calls
These are the backbone of orchestration.

Use `CallSequence` when:
- the logic is already modeled as a helper sequence
- the helper contract is stable enough to reuse
- you want backend composition without duplicating step trees

Use `CallTransaction` when:
- the raw source interaction belongs to a connector
- the connector still should not define the public contract

Good practice:
- call source-specific requestables behind a business sequence
- map their output back into the stable public response
- validate the business sequence, not only the inner call
- when a business sequence wraps a `CallTransaction`, keep the `TransactionStep` as an internal source (`output=false`) and make the shaping step such as `XMLCopyStep` or JSON steps own the public payload (`output=true`)
- if MCP/source-picker friction makes the shaping step hard to author, stop with a documented gap or create a minimal explicit copy/JSON shape; do not silently ship a business sequence whose public contract is only the raw connector subtree

### Output semantics on business sequence helpers
`output` controls what leaves the sequence result tree. It does **not** control whether another step can source the data.

Correct mental model:
- `output=true`: the step contributes directly to the public sequence result
- `output=false`: the step stays internal, but later steps can still source it normally

Canonical CRUD business sequence wrapper:
- `CallTransaction.output=false`
- `XMLCopyStep.output=true`

Why this is the right way:
- raw connector output stays internal
- the business sequence chooses deliberately what becomes visible
- source picker still works because internal steps remain valid producers

Common trap:
- leaving `CallTransaction.output=true` and then adding an `XMLCopyStep`, which leaks both the raw transaction subtree and the copied payload into the public contract

Common trap:
- exposing a raw `CallTransaction` result directly because it “already works”

Minimum validation proof:
- one direct validation on the called requestable when the inner shape matters
- one business sequence validation proving the public response stays stable

### 3. JSON-building steps
These are the canonical way to produce a stable JSON contract from Convertigo steps.

Most important:
- `JsonObjectStep`
- `JsonArrayStep`
- `JsonFieldStep`
- `JsonToXmlStep` when you must normalize incoming JSON into the sequence tree

