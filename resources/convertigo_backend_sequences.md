# Convertigo Backend Sequences

## When to read this
Read this when creating or changing sequences, facade requestables, orchestration flow, JSON responses, or SmartType wiring.

## What this guide covers
- Sequence and facade design.
- Request and response shaping.
- JSON steps, iterator patterns, and SmartType sourcing.
- Safe Rhino usage around `context`.
- Explicit runtime validation.

## Read this after the recipe
If the task is a common facade/stub flow, read `convertigo/recipe-facade-stub@1` first. Come here when you need the deeper sequence rules, SmartType details, or Rhino guardrails that the recipe does not cover.

## Mandatory workflow

### Recipe 1: build a facade sequence with stub JSON output
1. Inspect the target project or sequence subtree with `databaseobject-tree-get`.
2. Create the facade sequence under the project root if it does not exist.
3. Add or confirm input variables first.
4. Build the nominal response shape with explicit JSON steps.
5. Keep the stub payload aligned with the agreed contract.
6. Validate immediately with `requestable-execute`.

Minimal creation skeleton:

```json
{
  "target": "codex_test",
  "at": "inside",
  "tree": {
    "name": "sample_facade",
    "className": "sequences.GenericSequence"
  }
}
```

Minimal validation skeleton:

```json
{
  "requestable": "codex_test.sample_facade",
  "variables": {}
}
```

### Recipe 2: replace or enrich a stub with real orchestration
1. Keep the public response contract fixed.
2. Inspect the existing facade subtree and identify the stub-producing steps.
3. Add the real orchestration behind the facade:
   - connector transaction call
   - helper sequence call
   - mapping steps
4. Keep the final response-shaping steps under facade control.
5. Validate the facade again, not only the inner call.

### SmartType and sourceDefinition guidance
Use `databaseobject-schema` when source paths or requestable shapes are unclear.

Canonical picker-style `sourceDefinition` example:

```json
["123456789", "./ip/text()"]
```

Use the producer step priority and a precise path. Do not guess the XPath.

### Sequence boundary rules

| Object | Use it for | Rule |
| --- | --- | --- |
| Public facade sequence | stable request/response contract | UI and callers depend on this, so its shape must be deliberate |
| Internal helper sequence | reusable orchestration detail | Keep it internal and do not expose it as the main contract |
| Connector transaction | raw source interaction | Map it back into the facade contract instead of exposing it directly |

Read `convertigo://resources/convertigo-context-api` when:
- a script touches `context`
- you are tempted to store custom state in `context.*`

Read `convertigo://resources/convertigo-json-quickref` when:
- you need a fast reminder on JSON steps
- you need iterator or ordering details
- you need a quick SmartType-source refresher

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `palette-list`
- `palette-describe`
- `databaseobject-schema`
- `requestable-execute`
- `log-view`

## Anti-patterns / do not do
- Do not use direct YAML edits as the normal path.
- Do not hide the public response contract inside a large opaque script block when explicit steps can shape it.
- Do not store business state in custom `context.*` properties.
- Do not expose raw connector payloads directly when a facade sequence should own the contract.
- Do not postpone runtime validation until the end of the task.

### Frequent failure modes
- Custom `context.*` fields:
  - cause: treating `context` as a free JS object
  - fix: keep temporary data in local variables or dedicated storage
- Unclear response shape:
  - cause: building logic first and naming fields later
  - fix: lock the public contract before deeper implementation
- Delayed validation:
  - cause: waiting until the whole sequence is complete
  - fix: run `requestable-execute` after each logical block
- Hidden raw connector leakage:
  - cause: returning connector payload fields directly from the facade
  - fix: map raw data explicitly into the public response shape

## Completion checks
- The sequence tree is consistent and readable from `databaseobject-tree-get`.
- Public inputs and outputs are explicit.
- Any SmartType source or schema dependency is verified.
- `requestable-execute` proves the current response shape.
- The facade still owns the public contract after orchestration changes.
