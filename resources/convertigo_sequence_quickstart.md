# Convertigo Sequence Quickstart

This walkthrough illustrates the typical workflow for building a sequence via MCP tools only. Adapt the class names/variables to your own use case.

1. **Inspect the tree**
   - `databaseobject-children` on `codex_tooling.sq` to make sure the sequence name is free.
2. **Create the sequence**
   - `databaseobject-create` with `related="codex_tooling"`, `className="com.twinsoft.convertigo.beans.sequences.GenericSequence"`, `name="my_sequence"`, `mode="inside"`.
   - Call `project-save` (or keep `autoSave=true`).
3. **Add request variables**
   - Use `palette-list` targeting `codex_tooling.sq:my_sequence` (filter `Request single`). Each item now includes a `describe` block (tool + arguments) you can reuse directly.
   - Call `palette-describe` with that block to inspect `result.template.payloadJson`, swap `<parent QName>` for `codex_tooling.sq:my_sequence`, then feed it to `databaseobject-create` to add `RequestableVariable` objects.
4. **Bootstrap the response**
   - Add a `JsonObjectStep` (again via `palette-list` → `databaseobject-create`) returning `{ "status": "ready" }`.
   - Test immédiatement via `requestable-execute` (préféré même si curl fonctionnerait) :
     ```json
     {
       "requestable": "codex_tooling.my_sequence",
       "variables": "{\\"sentence\\":\\"Hello\\"}"
     }
     ```
   - Exécute le curl HTTP uniquement après validation MCP **et** si le serveur Convertigo est joignable.
5. **Add logic gradually**
   - Insert `SimpleStep` blocks for JavaScript logic, `JsonFieldStep`/`JsonArrayStep` for output.
   - After each addition: `project-save` → repeat the curl test.
6. **Validate inputs**
   - If a variable is required, set `databaseobject-properties-set` → `required=true` and describe the allowed values in `comment`.
7. **Final verification**
   - Run the target curl (with representative parameters) and keep the output for your final report.
8. **Cleanup**
   - Remove draft sequences/steps using `databaseobject-delete` if they are not part of the final solution.

Following this loop ensures you catch errors (missing variables, typos, context misuse) on the smallest possible diff.
