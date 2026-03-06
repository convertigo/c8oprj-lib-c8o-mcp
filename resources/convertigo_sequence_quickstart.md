# Convertigo Sequence Quickstart

This walkthrough shows a MCP-only, tree-first workflow to build a sequence.

1. Inspect the project tree
- Run `project-list` then `databaseobject-tree-get {"target":"<project>","childrenDepth":1,"properties":"none"}`.
- QNames are case-sensitive.

2. Create the sequence
- Use `databaseobject-tree-apply` with `at="inside"` on the project root:
```json
{
  "target": "<project>",
  "at": "inside",
  "tree": {
    "name": "my_sequence",
    "className": "sequences.GenericSequence"
  }
}
```

3. Add children from palette templates
- Run `palette-list` on `<project>.sq:my_sequence`.
- Run `palette-describe` on the selected `className`.
- Apply the returned creation template with `databaseobject-tree-apply` (same `target`, usually `at="inside"`).

4. Wire variables and sources
- Request variables are available in JS scope directly.
- Add `InputVariablesStep` only when you need XPath SmartType sources.
- For SmartType sources, use `["<stepPriority>","./path/text()"]` based on the producer step.
- Use `databaseobject-schema` to inspect XML/JSON shape before wiring complex paths.

5. Build response
- Add `JsonObjectStep` / `JsonFieldStep` / `JsonArrayStep` nodes via `tree-apply`.
- For updates on existing nodes, call `tree-apply` with `at="self"` and `mode="merge"`.

6. Test early
- Run `requestable-execute` after each logical block:
```json
{
  "requestable": "<project>.my_sequence",
  "variables": {"sentence":"Hello"}
}
```
- If needed, add `includeLogs=true` for quick diagnostics.

7. Save
- Run `project-save` when the sequence is stable.

8. Cleanup
- Remove draft objects with `databaseobject-delete`.

## Error handling
- Prefer explicit sequence control flow (`If`, `IfThenElse`, `JIf`) over large try/catch scripts.
- Let engine errors surface in `requestable-execute` output.
- For HTTP-specific setup, read `convertigo_transaction_quickstart` first.
