# Convertigo Sequence Quickstart

This walkthrough illustrates the typical workflow for building a sequence via MCP tools only. Adapt the class names/variables to your own use case.
Before editing, read the key resources exposed via `resources/list` (at minimum `convertigo_mcp_usage`, this quickstart, and `convertigo_context_api`) so you fully understand the guardrails Codex must follow.

1. **Inspect the tree**
   - `databaseobject-children` on `codex_tooling.sq` to make sure the sequence name is free.
2. **Create the sequence**
   - `databaseobject-create` with `related="codex_tooling"`, `className="com.twinsoft.convertigo.beans.sequences.GenericSequence"`, `name="my_sequence"`, `mode="inside"`.
   - Call `project-save` (or keep `autoSave=true`).
3. **Add request variables**
   - Use `palette-list` targeting `codex_tooling.sq:my_sequence` (filter `Request single`). Grab the `describeClassName` for the item you need.
   - Call `palette-describe` with that class name. Use `result.template.payloadJson` (replace `<parent QName>` with `codex_tooling.sq:my_sequence`) as the payload for `databaseobject-create`, and read `result.propertyHints[]` - each hint carries a `llmHint` string when a property needs a specific format (SmartType `sourceDefinition`, XMLVector lists, etc.).
4. **Expose request data via `InputVariablesStep`**
   - Insert an `InputVariablesStep` at the top of the sequence (palette -> `Input variables` entry). It materializes the incoming request variables as XML so SmartTypes can source them.
   - When you bind a transaction/sequence step variable to a request value, never reference the variable name directly. Instead, use the SmartType array `["<stepPriority>", "./<var>/text()"]` where `<stepPriority>` is the priority of the `InputVariablesStep`. Example from `lib_BaseRow.AdminUserCreate`: the `username` step variable uses `["1729005249299", "./email/text()"]` to read the `email` request variable that the `InputVariablesStep` produced.
   - The same rule applies to chaining outputs: to reuse the token returned by another step, point to that step's priority and the XPath to the data (e.g., `["1728982368849", "./document/Bearer/text()"]`). This is the canonical Convertigo pattern for SmartType sources.
5. **Bootstrap the response**
   - Add a `JsonObjectStep` (again via `palette-list` -> `databaseobject-create`) returning `{ "status": "ready" }`.
   - Test immediately with `requestable-execute` (this is the **only** mandatory test):
     ```json
     {
       "requestable": "codex_tooling.my_sequence",
       "variables": "{\\"sentence\\":\\"Hello\\"}"
     }
     ```
     Tips:
     - `variables` must always be a JSON string representing a key/value object (never an array or query string).
     - When using `codex exec`, start with `tools/call convertigo.requestable-execute …` and review the JSON output. Only fall back to plain HTTP if the user explicitly asks (see `convertigo-mcp-usage` for the curl reminder).
   - If the HTTP server is unavailable (sandboxed CLI), stick to the MCP test and note it in your report.
6. **Add logic gradually**
   - Insert `SimpleStep` blocks for JavaScript logic, `JsonFieldStep`/`JsonArrayStep` for output.
   - When you edit an existing object, call `databaseobject-properties-get` with `includeHints=true` to retrieve the same `llmHint` guidance that `palette-describe` exposed earlier.
   - After each addition: `project-save` (ou `autoSave=true`) -> rerun `requestable-execute`.
7. **Validate inputs**
   - If a variable is required, set `databaseobject-properties-set` -> `required=true` and describe the allowed values in `comment`.
8. **Final verification**
   - Attach the final `requestable-execute` output in your summary. Run an HTTP curl only if the user explicitly requests it or you can confirm `localhost:18080` is reachable.
9. **Cleanup**
   - Remove draft sequences/steps using `databaseobject-delete` if they are not part of the final solution.

Following this loop ensures you catch errors (missing variables, typos, context misuse) on the smallest possible diff.



