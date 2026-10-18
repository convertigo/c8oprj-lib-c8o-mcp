# Convertigo Backend Sequences

## When to read this
Read this when creating or changing backend sequences, business sequence requestables, helper orchestration, JSON output shaping, SmartType wiring, or step logic that must stay correct over time.

## What this guide covers
- How Convertigo sequences think: requestables, XML execution tree, JSON output steps, and business sequence ownership.
- Which step families matter most in enterprise backends.
- Where SmartTypes, source picker, strict mode, and Rhino 1.9.2 scoping create real friction.
- How to shape stable responses and validate them early.

## Read this after the recipe
If the task is a standard business sequence + stub or business sequence + integration path, read `convertigo/recipe-business-sequence-stub@1` first. Use this handbook when the recipe is not enough and you need the real semantics behind steps, SmartTypes, source picking, scoping, or output shaping.

## Convertigo sequence mental model

### A sequence is not “just code”
A Convertigo sequence is a tree of beans that executes into a result DOM. Even when the final payload is JSON-oriented, the execution model still matters:
- every step has a place in the tree
- source picker points to previous step outputs
- output and ordering are structural, not only textual
- helper logic can run without becoming part of the final contract

### Public business sequence vs internal helper
Use two levels when the backend grows beyond a trivial path.

Public business sequence:
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
- broad defensive wrappers when the standard error bubble already expresses the failure correctly

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

### 5. Shared business logic in `js/` files
When several sequences need the same rule (a date computation, a status, a validation), write it once in a project script and load it where needed instead of copying it into each `SimpleStep`.

Write the file:
- `project-js-set` with `project=<your application project>` creates or replaces `<project>/js/<file>.js` (send the whole file); `project-js-get` with the same `project` reads it back. `project` is required: never target the MCP server project
- write Rhino 1.9.2 compatible code and hang functions on one namespace object (`var Pca = Pca || {}; Pca.dueDate = function (d) { ... };`) so several includes do not collide

Load it in a sequence:
- add a first `steps.SimpleStep` whose `expression` is `include("js/<file>.js");` (path relative to the project folder)
- later steps of the same sequence (`SimpleStep`, `IfStep` conditions, SmartTypes in `JS` mode) can then call its functions
- give every sequence that uses it its own include step

Read a called requestable's result in JavaScript:
- `steps.JsonSourceStep`: sets `variableName` to a JS value built from the producer's XML (JSON types restored when the requestable generates them, as SQL transactions do with `generateJsonTypes=true`)
- `steps.SimpleSourceStep`: sets `variableName` to the text of the first matching node
- `steps.SourceStep`: sets `variableName` to the matching DOM nodes
- write their `sourceDefinition` as `{"step":"<name of the TransactionStep or SequenceStep>","xpath":"./document/..."}`: the MCP resolves the name in the sequence (the step must be created first, an earlier sibling in the same tree works) and stores `["<priority>", "./document/..."]`; the xpath starts at the called requestable's `document`, e.g. `./document/sql_output` for an `SqlTransaction`, or `./document/*[@originalKeyName='result']` for a JSON field named `result`
- check the exact path with `databaseobject-schema` or one `requestable-execute` of the called requestable before wiring it
- under a `SequenceStep`, source `./document` and read the fields in JS (`.document.data`): a deeper xpath such as `./document/data` can return `null`
- rows from `./document/sql_output` come as an array created in another Rhino scope: `rows instanceof Array` is `false`. Loop on `rows.length` (or copy into a local array first) instead of testing `instanceof Array`
- a sequence variable is a JavaScript variable of the same name in every step: read `profile` directly. `context.get("profile")` reads a context attribute (set with `context.set`), not a request variable, so it returns nothing and the code falls back to its default on every call. Do not redeclare the variable from another source (`var profile = context.get(...)`)
- sequence variables read in JS are Java strings (`typeof` is `object`): call `String(v)` before `split`, regular expressions or `===` comparisons

A failing call does not stop the sequence:
- when the transaction behind a `TransactionStep` fails (SQL error, type mismatch), the sequence goes on with the next steps and the business sequence still answers success. The error is in the step's document: source `./document` and test it before using the rows or counting a write, for example `if (doc && doc.document && doc.document.error) { resp = app.fail("ECRITURE_KO", String(doc.document.error.details || doc.document.error.message)); }` (checked: a failing INSERT left the following steps running)
- pass dates to SQL as strings (`'2026-10-17'`, `'2026-10-17 08:00:00'`), never as a JavaScript `Date` object: the object becomes its English text form, which the column refuses

Calling a requestable with parameters:
- a `StepVariable` with no source and no value takes the value of the JavaScript variable of the same name in the sequence scope (a sequence variable or a `var` set by a previous `SimpleStep`), else its default value
- create the step variables with `importVariables:true` on the `TransactionStep` or `SequenceStep` node (after `sourceTransaction`/`sourceSequence`): the MCP imports one `StepVariable` per variable of the called requestable, with its default value. Then set the JavaScript variables of the same names before the call

`business-sequence-create` builds this chain for a business sequence (include, user read and role check, reads, a logic step calling a function of the file, guarded writes, the four outputs): see `convertigo-recipe-multipage-app`, Generators. Build it by hand when the business sequence needs other steps.

Minimal chain:

```text
↓Include          steps.SimpleStep       include("js/pca_rules.js");
↓CallList         steps.TransactionStep  output=false
↓Rows             steps.JsonSourceStep   source ["<CallList priority>", "./document/sql_output"], variableName=rows
↓Compute          steps.SimpleStep       var result = Pca.withStatus(rows, today);
↓response         steps.JsonToXmlStep    jsonObject = JS "result", key "response", output=true
```

The key of the output step is the top-level key of the response: here callers read `response.*`. A business sequence called by NGX pages emits its contract keys at top level instead (one `JsonToXmlStep` per key `success`, `data`, `errors`, `meta`, see `convertigo-recipe-multipage-app`), so `out?.success` works in the page.

Common trap:
- reading the transaction through `context.*` or re-executing it in JS instead of sourcing the `TransactionStep`

Minimum validation proof:
- one `requestable-execute` of the sequence showing the computed fields
- after editing the file with `project-js-set`, run the sequence again and check the new behaviour is used

### Best-case first, trust the error bubble
Default backend generation should assume the nominal path works:
- wire the happy-path requestables cleanly
- keep helper steps internal
- let standard Convertigo execution errors surface unless a special UX contract really needs interception

Prefer this:
- one clear call path
- one explicit shaping step
- one validation proof

Avoid this by default:
- nested `try/catch` wrappers
- manual fallback branches for routine failures
- duplicating Convertigo's standard runtime error reporting in each sequence

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
- these mistakes create silent empty values or wrong shapes that only appear later in the business sequence

Minimum validation proof:
- inspect the producer tree
- run the sequence and confirm the sourced value materializes where expected

## Schema learning when mapping matters

### Use schema early when the sequence depends on a requestable shape
If a sequence is about to map the result of:
- an SQL transaction
- an HTTP transaction
- another requestable whose structure is not already proven

then schema matters before you finalize the mapping.

Use this workflow:
1. run the requestable with representative input
2. when the requestable is a transaction, use `requestable-execute(..., {"recordSchema": true})`
3. inspect the resulting shape with `databaseobject-schema`
4. source and map against the learned structure, not a guessed one

Why this is the right way:
- business sequence mapping stops being speculative
- source picker decisions become reproducible
- later UI or specialist work inherits a real structure instead of a guess

### When `recordSchema=true` is relevant
`recordSchema=true` is relevant when:
- the target is a transaction, not a sequence
- downstream mapping depends on the raw source shape
- a picker or sourceDefinition will rely on that shape later

It is not a substitute for runtime proof on sequences. It is the persistence step that makes the transaction response inspectable later.

### How `databaseobject-schema` helps
Use `databaseobject-schema` after runtime proof to:
- inspect the current response shape
- confirm field names and nesting before building JSON mapping
- avoid blind XPath/sourceDefinition authoring
- support later picker-driven work without reverse-engineering the raw transaction again

Common trap:
- build the mapping blind, then discover picker/schema pain later when the raw shape differs from the first guess

### `IfStep`, `IfThenElseStep` and `WhileStep` conditions are booleans
The engine accepts only `true` or `false` from a block condition: any other value stops the sequence with `Invalid step condition. Step: "<name>"`. A JavaScript `&&` / `||` chain returns one of its operands, not a boolean, so `resp && resp.success && resp.journal` gives the `resp.journal` object (and `resp && ...` gives `null` when `resp` is null). End the chain with a comparison (`resp.journal != null`, `rows.length > 0`, `resp.success === true`) or wrap it: `!!(resp && resp.journal)`. The number of operands does not matter. tree-apply warns when the last operand is a bare value.

### Object literals in a JS SmartType
A JS expression `{}` or `{ seeded: true }` is read as a block of statements, not an object: it gives `undefined`, and the step fails with a bare `An exception occured while executing step` that names no step. Write `({ seeded: true })`. tree-apply adds the parentheses when an expression is an object literal, and requestable-execute lists the suspicious steps (`error.hints`) when a sequence fails with that empty message.

### `IteratorStep.condition` semantics
`IteratorStep.condition` is not a free-form prose flag. Treat it as a normal conditional expression evaluated at runtime.

Use it when:
- you already have an iterator source
- you need to skip some candidate items without changing the source itself

Keep it simple:
- the condition must evaluate to a boolean-like result
- use one explicit JS expression when you need computed logic
- leave it empty when every iterated item should pass

Valid patterns:
- `item != null`
- `String(item).length > 0`
- `vars.enabled == "true"`

Invalid patterns:
- raw XPath fragments without a boolean expression
- comma-joined source tokens
- human prose such as `only when not empty`
- copied `sourceDefinition` arrays or JSON objects placed into `condition`

Rule of thumb:
- `sourceDefinition` chooses **what** you iterate
- `condition` decides **whether the current iterated item continues**

If you are not sure:
1. prove the iterator source first
2. start with no condition
3. add one minimal boolean expression only when the filtering rule is explicit

## Output shaping and `output=true/false`
Not every step should contribute to the public response. Convertigo trees are easier to maintain when orchestration and response shaping stay separate.

Use output-bearing steps for:
- deliberate public fields
- deliberate public arrays/objects

Keep helper/orchestration steps out of the public response when:
- they are only intermediate
- they leak raw source details
- they would make the business sequence tree noisy or unstable

Common trap:
- leaving every helper step visible, then sourcing against accidental structure or exposing implementation details

Rule of thumb:
- business sequence response tree should contain contract structure
- helper steps should exist for orchestration, not public leakage

## Canonical backend patterns

### Pattern 1: business sequence + stub
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

### Pattern 2: business sequence + orchestration behind it
Use when:
- the sequence must call connectors or helper sequences
- the public contract must stay independent of source systems

Structure:
1. input normalization
2. helper or transaction call
3. mapping steps
4. final explicit public response

Why this is the right way:
- source-specific change stays behind the business sequence

Common trap:
- connector response leaks into the public payload after a “temporary” shortcut

Minimum validation proof:
- direct inner validation if the source is new
- business sequence validation afterward

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

These cover most enterprise business sequence work without forcing the agent to rediscover the whole step catalog.

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
