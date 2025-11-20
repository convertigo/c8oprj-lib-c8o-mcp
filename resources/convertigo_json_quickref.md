# Convertigo JSON Steps Quickref

- **Common classes** (short names, Convertigo auto-prefixes them with `com.twinsoft.convertigo.beans.`): JsonObject (`steps.JsonObjectStep`), JsonArray (`steps.JsonArrayStep`), SimpleIterator (`steps.SimpleIteratorStep`), JsonField (`steps.JsonFieldStep`), SimpleStep (`steps.SimpleStep`), InputVariables (`steps.InputVariablesStep`). Use these with `palette-describe`; pass short names in `className`.
- **Root object**: `JsonObjectStep` with key (PLAIN) = response field name (e.g., `response`). Children become nested fields/arrays.
- **Arrays**: `JsonArrayStep` with key = array name (e.g., `words`). Add a `SimpleIteratorStep` inside; set its source to a JS array (e.g., `wordsData`). Each loop produces one array entry.
- **Items**: inside the iterator, add a `JsonObjectStep` (one item). Add `JsonFieldStep` children for each property (`text`, `length`, etc.). `JsonFieldStep.key`=PLAIN name, `value`=JS expression (often `item.*`), set `type` when numeric/boolean.
- **Ordering**: step priorities define order. Use `databaseobject-children` to inspect priorities; `databaseobject-move` to reorder when needed.
- **SmartTypes**: if a property expects a `sourceDefinition` SmartType, use the `[priority, xpath]` array on the **input step** you want to source (see `palette-describe` `propertyHints[].llmHint`).
- **Iteration tip**: keep intermediate data in a local JS array (e.g., `var wordsData = [...]`) and point the iterator to it; avoid custom fields on `context`.
- **Testing**: after each change, run `tools/call convertigo.requestable-execute {"requestable":"<project>.sequence","variables":"{\"sentence\":\"Hello\"}"}`.


