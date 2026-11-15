# Public JSON fields and call-step output paths

Read when: Public JSON fields and call-step output paths. Summary: `convertigo://guides/backend`.
Previous: `convertigo://guides/backend/step-taxonomy-that-matters-most`. Next: `convertigo://guides/backend/step-taxonomy-that-matters-most-3`.

---

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
- a step's name is not a JavaScript variable: `typeof CallList` or `CallList.document` reads `undefined` (a test on it always takes the same branch); read a step through one of these source steps
- write their `sourceDefinition` as `{"step":"<name of the TransactionStep or SequenceStep>","xpath":"./document/..."}`: the MCP resolves the name in the sequence (the step must be created first, an earlier sibling in the same tree works) and stores `["<priority>", "./document/..."]`; the xpath starts at the called requestable's `document`, e.g. `./document/sql_output` for an `SqlTransaction`, or `./document/*[@originalKeyName='result']` for a JSON field named `result`
