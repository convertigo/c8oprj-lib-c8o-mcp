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










### HTTP connectors (quick reminder)
- Base URL: scheme + host, no trailing slash (e.g., `https://httpbin.org`).
- Transaction subPath: starts with `/` (e.g., `/ip`). Final URL = base + subPath (avoid `//`).
- Turn `httpInfo=true` while building and test the transaction alone with `requestable-execute {"requestable":"<project>.<connector>.<transaction>"}` before wiring it into a sequence.
- HTTP connectors: base URL = scheme+host without trailing slash; subPath starts with `/` and is appended to the connector rootPath (avoid `//`). Enable `httpInfo=true` and test the transaction via `requestable-execute` before using it in a sequence.
- To pick XPaths quickly, call `databaseobject-schema` on the target step/transaction to get XML/JSON samples instead of guessing sources.
- HTTP fallback: there is no global  continue on error toggle on request steps; wrap HTTP calls in If/Then/Else (or JIf) and return a fallback JSON when the call fails. Enable httpInfo=true while debugging.
- If databaseobject-create with mode=after fails with decoding error, create with mode=inside then reorder via databaseobject-move.
