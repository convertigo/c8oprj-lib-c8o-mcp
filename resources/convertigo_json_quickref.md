# Convertigo JSON Steps Quickref

- **Common classes** (short names):
  - `steps.JsonObjectStep`
  - `steps.JsonArrayStep`
  - `steps.SimpleIteratorStep`
  - `steps.JsonFieldStep`
  - `steps.SimpleStep`
  - `steps.InputVariablesStep`
- **Root object**: `JsonObjectStep` with key (PLAIN) set to the top-level response field.
- **Arrays**: add `JsonArrayStep`, then a `SimpleIteratorStep` inside to produce entries.
- **Items**: inside iterator, add `JsonObjectStep` + `JsonFieldStep` children.
- **Ordering**: priorities define order. Inspect with `databaseobject-tree-get`; reorder with `databaseobject-move`.
- **SmartType sources**: for `sourceDefinition`, use `["<priority>","./xpath"]` from the producer step.
- **Scope**: keep intermediate arrays/objects in local JS variables, not in custom `context.*` fields.
- **Testing**: validate with `requestable-execute` after each logical change.
