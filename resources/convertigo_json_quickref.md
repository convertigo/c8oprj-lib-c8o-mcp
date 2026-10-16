# Convertigo JSON Steps Quickref

Open this only when you need a quick reminder on JSON-step structure, iterator ordering, or SmartType source wiring.

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
- **Results into JS**: `JsonSourceStep` (JS value), `SimpleSourceStep` (text) or `SourceStep` (nodes) put a producer's result into `variableName`; the xpath under a `TransactionStep`/`SequenceStep` starts with `./document/`. Shared helpers live in `js/` (`project-js-set`) and are loaded with a `SimpleStep` `include("js/<file>.js");`. See `convertigo-backend-sequences`, section 5.
- **Scope**: keep intermediate arrays/objects in local JS variables, not in custom `context.*` fields.
- **Testing**: validate with `requestable-execute` after each logical change.
