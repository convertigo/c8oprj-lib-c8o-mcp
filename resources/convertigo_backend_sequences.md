# Convertigo Backend Sequences

## When to read this
Read this when creating or changing backend sequences, facade requestables, helper orchestration, JSON output shaping, SmartType wiring, or step logic that must stay correct over time.

## What this guide covers
- How Convertigo sequences think: requestables, XML execution tree, JSON output steps, and facade ownership.
- Which step families matter most in enterprise backends.
- Where SmartTypes, source picker, strict mode, and Rhino 1.9.2 scoping create real friction.
- How to shape stable responses and validate them early.

## Read this after the recipe
If the task is a standard facade + stub or facade + integration path, read `convertigo/recipe-facade-stub@1` first. Use this handbook when the recipe is not enough and you need the real semantics behind steps, SmartTypes, source picking, scoping, or output shaping.

## Convertigo sequence mental model

### A sequence is not “just code”
A Convertigo sequence is a tree of beans that executes into a result DOM. Even when the final payload is JSON-oriented, the execution model still matters:
- every step has a place in the tree
- source picker points to previous step outputs
- output and ordering are structural, not only textual
- helper logic can run without becoming part of the final contract

### Public facade vs internal helper
Use two levels when the backend grows beyond a trivial path.

Public facade sequence:
- owns the request and response contract
- exposes stable nominal and error fields
- is the only requestable the UI or external callers should depend on

Internal helper sequence:
- owns reusable orchestration or source-specific adaptation
- can change without breaking the caller contract
- should not silently become the public API

Good split:
- `crm_contacts_facade`
- `crm_contacts_http_fetch`
- `crm_contacts_sql_search`

Bad split:
- one huge public sequence that mixes raw connector output, mapping, error handling, and internal state in the same script block

### XML result tree vs JSON-oriented response
Convertigo sequences always execute in a structured tree. JSON-oriented steps help you produce a deliberate payload, but they do not remove the underlying step ordering rules.

Use explicit JSON steps when:
- the contract is JSON-shaped
- the public response needs stable field order or naming
- the backend must hide connector-specific raw structure

Do not rely on “whatever the inner call returns” as the public output if the contract matters.

### Strict mode and source semantics matter
Strict mode changes how sourced elements are passed when one sequence calls another requestable. If you want text, source the text node explicitly when needed instead of assuming the whole element will coerce the way you expect.

Use source picker with this mindset:
- source the exact producer step
- source the exact node or text that represents the contract value
- do not guess the XPath

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
- stop early when the facade already has enough evidence to return

Why this is the right way:
- explicit flow steps make the orchestration readable in tree form
- source picker and output behavior stay visible
- critics and future maintainers can reason about the sequence without reverse-engineering a large script

Common trap:
- pushing all conditional flow into one `SimpleStep` with many side effects, then losing traceability and sourceability

Minimum validation proof:
- `requestable-execute` covers the happy path
- `requestable-execute` covers one missing/empty/error path
- the final facade output changes only where the contract says it should

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
- call source-specific requestables behind a facade
- map their output back into the stable public response
- validate the facade, not only the inner call

Common trap:
- exposing a raw `CallTransaction` result directly because it “already works”

Minimum validation proof:
- one direct validation on the called requestable when the inner shape matters
- one facade validation proving the public response stays stable

### 3. JSON-building steps
These are the canonical way to produce a stable JSON contract from Convertigo steps.

Most important:
- `JsonObjectStep`
- `JsonArrayStep`
- `JsonFieldStep`
- `JsonToXmlStep` when you must normalize incoming JSON into the sequence tree

Use them when:
- the public response must have named top-level fields
- rows/items need remapping
- you need a nominal payload and an error payload with the same top-level contract

Canonical output pattern:
- one root object
- top-level metadata fields first
- nested `items` array second
- one explicit `error` object or error fields

Example public shape:

```json
{
  "status": "ok",
  "source": "sql",
  "items": [
    { "id": "42", "label": "Alice" }
  ],
  "total": 1,
  "error": ""
}
```

Why this is the right way:
- callers know where to read the payload
- connector-specific row shapes stay hidden
- stub/live parity is much easier to maintain

Common trap:
- letting the raw JSON transaction or raw SQL row shape define your public payload

Minimum validation proof:
- same top-level fields exist in stub and live path
- `items` shape is deliberate and not inherited blindly

### 4. JavaScript / Rhino scope
Convertigo still uses Rhino 1.9.2 semantics. Treat script steps as scoped helpers, not as an excuse to store state everywhere.

Use script for:
- small computed values
- light transformation that is awkward in step form
- local decisions feeding later explicit steps

Do not use script for:
- hidden contract definition
- large mutable shared state
- custom `context.*` business storage

Safe scoping rules:
- keep temporary values local to the step when possible
- if later steps need the value, make the transfer explicit
- avoid assuming modern JS runtime behavior that Rhino 1.9.2 does not provide
- prefer simple expressions and predictable object shapes

Common trap:
- treating Rhino like modern Node/Chromium JS, then depending on syntax or scope behavior that is not guaranteed

Minimum validation proof:
- one execution path with representative variables
- no hidden runtime dependence on custom `context.*` fields

## SmartType and source picker: the real rules

### SmartType is a modeling choice
Many properties are SmartTypes. That means the same property can be expressed as:
- fixed text
- JavaScript expression
- source-picked value

Pick the mode intentionally.

Use text mode when:
- the value is part of the stable contract or static configuration
- the same literal should appear every time

Use JavaScript mode when:
- the value is computed from inputs or previous intermediate values
- the computation is small and obvious

Use source mode when:
- the value is already present in a previous step result
- the source path is the clearest representation of the intent

### Source picker is about exact provenance
A source is not “some previous value”. It is:
- one producer step
- one XPath
- evaluated at runtime on that step result

Good canonical example:

```json
["123456789", "./ip/text()"]
```

The first token is the producer step priority. The second token is the exact extraction path. Keep both stable and deliberate.

### Common source-picker mistakes
- picking the parent element instead of the text node when text is needed
- guessing the path without reading the producer tree
- reusing a stale sourceDefinition copied from another sequence
- sourcing from a step whose execution is conditional, then assuming it always exists

Why this matters:
- these mistakes create silent empty values or wrong shapes that only appear later in the facade

Minimum validation proof:
- inspect the producer tree
- run the sequence and confirm the sourced value materializes where expected

## Output shaping and `output=true/false`
Not every step should contribute to the public response. Convertigo trees are easier to maintain when orchestration and response shaping stay separate.

Use output-bearing steps for:
- deliberate public fields
- deliberate public arrays/objects

Keep helper/orchestration steps out of the public response when:
- they are only intermediate
- they leak raw source details
- they would make the facade tree noisy or unstable

Common trap:
- leaving every helper step visible, then sourcing against accidental structure or exposing implementation details

Rule of thumb:
- facade response tree should contain contract structure
- helper steps should exist for orchestration, not public leakage

## Canonical backend patterns

### Pattern 1: facade + stub
Use when:
- planner must lock the contract fast
- UI or specialist work must start now
- the real integration is not ready yet

Structure:
1. public variables
2. nominal top-level fields
3. error top-level fields
4. `__stub`-aware behavior if runtime stub proof is needed

Why this is the right way:
- contract exists before full implementation
- UI and integration can work in parallel

Common trap:
- adding a stub payload that does not match the final public shape

Minimum validation proof:
- `requestable-execute` on nominal path
- `requestable-execute` with stub proof when the scenario requires it

### Pattern 2: facade + orchestration behind it
Use when:
- the sequence must call connectors or helper sequences
- the public contract must stay independent of source systems

Structure:
1. input normalization
2. helper or transaction call
3. mapping steps
4. final explicit public response

Why this is the right way:
- source-specific change stays behind the facade

Common trap:
- connector response leaks into the public payload after a “temporary” shortcut

Minimum validation proof:
- direct inner validation if the source is new
- facade validation afterward

### Pattern 3: explicit error payload
Use when:
- upstream systems may fail
- UI or client logic expects consistent top-level fields

Good error pattern:

```json
{
  "status": "error",
  "source": "http",
  "items": [],
  "total": 0,
  "error": {
    "code": "upstream_failed",
    "message": "Remote service unavailable"
  }
}
```

Do not let exceptions or raw connector details become the public error contract accidentally.

### Pattern 4: JSON response assembly
Use when:
- multiple sources must become one stable object
- row or XML structures must be remapped

Order:
1. gather source data
2. transform into stable field names
3. assemble one explicit root object
4. validate the final contract

## Indispensable step families to teach first
If an agent knows only a small set at first, prioritize these:
- `CallSequence`
- `CallTransaction`
- `JsonObjectStep`
- `JsonArrayStep`
- `JsonFieldStep`
- `IfThenElse` / `IfExistThenElse`
- `Iterator`
- `Return`
- small JavaScript / simple expression steps
- explicit error shaping steps

These cover most enterprise facade work without forcing the agent to rediscover the whole step catalog.

## When to escalate to references
Read `convertigo://resources/convertigo-context-api` when:
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
- always remap into explicit facade JSON steps

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
- Facade and helper responsibilities are distinct.
- `requestable-execute` proves the nominal path.
- `requestable-execute` proves at least one empty/error or alternate path.
- The final public contract remains stable after orchestration changes.
