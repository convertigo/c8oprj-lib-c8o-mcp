# Add a business sequence

Read when: Add a business sequence. Summary: `convertigo://guides/yaml-editing`.
Previous: `convertigo://guides/yaml-editing/references`. Next: `convertigo://guides/yaml-editing/ngx-page`.

---

## Add a business sequence
1. Copy the closest existing sequence file of the project (`_c8oProject/sequences/<name>.yaml`) to the new name, and renumber its priorities.
2. Add its reference line in `c8oProject.yaml`, among the other sequences in alphabetical order: `  ↓<name> [sequences.GenericSequence]: 🗏 sequences/<name>.yaml`.
3. Its body, at column 0:
   - `accessibility` (`Public`, `Hidden` for a sequence the app calls, `Private` for a helper) and `authenticatedContextRequired` (`true` when it reads protected data), `comment`;
   - its steps, in order; each step's children are indented under it;
   - its input variables last: `↓id [variables.RequestableVariable-<priority>]: ` with `comment`, `description` and, when it has one, `value` (its default).
4. Common steps, as the project's sequences write them:
   - call a transaction: `↓call_x [steps.TransactionStep-<p>]: ` with `sourceTransaction: <Project>.<connector>.<transaction>`; a child `↓id [variables.StepVariable-<p>]: ` passes the sequence variable of the same name;
   - expose its answer to JavaScript: `↓src_x [steps.JsonSourceStep-<p>]: ` whose `sourceDefinition` is the vector `[<priority of call_x>, ./document]` and `variableName: doc_x`; then `doc_x.document.sql_output` is the array of rows (column names as the SQL aliases);
   - compute: `↓logic [steps.SimpleStep-<p>]: ` with an `expression` (JavaScript ES5 for Rhino: `var`, `function`, no arrow functions, no `let`/`const`); sequence variables are JavaScript variables of the same name;
   - answer: `↓out [steps.JsonToXmlStep-<p>]: ` with `key` (a PLAIN SmartType: the field name) and `jsonObject` (a JS SmartType: the expression of the value, an object or an array), or `JsonObjectStep` / `JsonFieldStep` with SOURCE or JS values as the existing sequences show.
5. A SQL query the sequence needs and the connector lacks is a new transaction in `_c8oProject/connectors/<connector>.yaml`: `↓name [transactions.SqlTransaction]: ` at column 0, `sqlQuery: |` (plain SQL lines, `{var}` for a variable) and its `↓var [variables.RequestableVariable-<p>]: ` children. Copy a transaction of the same connector.
6. Reload, then prove it: `requestable-execute` with `requestable: "<Project>.<sequence>"` and its variables. A sequence with `authenticatedContextRequired: true` needs a signed-in user: pass `authenticatedUser`, or run the project's login sequence first with `before`.
