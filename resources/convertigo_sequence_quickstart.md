# Convertigo Sequence Quickstart

This walkthrough illustrates the typical workflow for building a sequence via MCP tools only. Adapt the class names/variables to your own use case.
Before editing, read the key resources exposed via `resources/list` (at minimum `convertigo_mcp_usage`, this quickstart, `convertigo_context_api`, and `convertigo_json_quickref` for JSON step patterns) so you fully understand the guardrails Codex must follow.

1. **Inspect the tree**
   - QNames are **case-sensitive**. Start from the project root: call `project-list` to spot your project, then `databaseobject-children` on `<project>` (no `.sq`) to confirm names before creating anything.
2. **Create the sequence**
   - `databaseobject-create` with `related="<project>"`, `className="sequences.GenericSequence"`, `name="my_sequence"`, `mode="inside"`.
   - Call `project-save` (or keep `autoSave=true`).
3. **Add request variables**
   - Use `palette-list` targeting `<project>.sq:my_sequence` (filter `Request single`). Grab the `describeClassName` for the item you need.
   - Call `palette-describe` with that class name. Use `result.template.payloadJson` (replace `<parent QName>` with `<project>.sq:my_sequence`) as the payload for `databaseobject-create`, and read `result.propertyHints[]` - each hint carries a `llmHint` string when a property needs a specific format (SmartType `sourceDefinition`, XMLVector lists, etc.). If you have no properties to set, pass {} (empty object) rather than an array or empty string.
4. **Expose request data via `InputVariablesStep`**`r`n   - Insert an `InputVariablesStep` at the top of the sequence (palette -> `Input variables` entry) when you need XPath sources for SmartTypes. Request variables are already available in JS scope; the InputVariables step is only to expose them as XML for SmartType sourcing.
   - When you bind a transaction/sequence step variable to a request value, never reference the variable name directly. Instead, use the SmartType array `["<stepPriority>", "./<var>/text()"]` where `<stepPriority>` is the priority of the `InputVariablesStep`. Example from `lib_BaseRow.AdminUserCreate`: the `username` step variable uses `["1729005249299", "./email/text()"]` to read the `email` request variable that the `InputVariablesStep` produced.
   - The same rule applies to chaining outputs: to reuse the token returned by another step, point to that step's priority and the XPath to the data (e.g., `["1728982368849", "./document/Bearer/text()"]`). This is the canonical Convertigo pattern for SmartType sources.
   - To preview the XML/JSON shape before wiring SmartTypes, call the MCP tool `databaseobject-schema` on the target QName (for example a `JsonObjectStep` or the sequence root). XML samples are rooted on that element (no `<document>` wrapper) so XPath is relative (e.g., `./Name`, `./@originalKeyName`). The JSON sample is already unwrapped for a quick check before adding SmartType sources.
5. **Bootstrap the response**
   - Add a `JsonObjectStep` (again via `palette-list` -> `databaseobject-create`) returning `{ "status": "ready" }`.
   - Test immediately with `requestable-execute` (this is the **only** mandatory test):
     ```json
     {
       "requestable": "<project>.my_sequence",
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









Testing & error handling
------------------------
- Prefer `requestable-execute` to run sequences/transactions so errors bubble naturally in the MCP response.
- No JS try/catch in palette: keep the happy path and guard with `If`/`IfThenElse`/`IfExist` (or `JIf`) when inputs are optional.
- For explicit failures, set a clear status/message via steps (`SetResponseStatusStep` + `ErrorStep` or a JSON reply) then `ReturnStep` to stop.
- Let engine exceptions surface (they appear in the MCP response); don’t attempt to swallow them in scripts.

### HTTP connectors

Keep this guide focused on sequences: for HTTP setup (URL, https/port, httpInfo, schema recording), **read `convertigo_transaction_quickstart` first**, then come back to wire the CallTransaction step and any fallback branch.

CallTransaction / CallSequence best practice: keep `output=false` and map only what you need into your JSON/XML using `JsonObject`/`JsonField` (or `XMLCopy`) after the call. This is far easier once the transaction schema has been learned via `requestable-execute ... recordSchema=true`.




