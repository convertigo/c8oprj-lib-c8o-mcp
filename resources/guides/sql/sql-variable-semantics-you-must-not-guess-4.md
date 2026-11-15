# Transaction authoring and schema-proof sequence

Read when: Transaction authoring and schema-proof sequence. Summary: `convertigo://guides/sql`.
Previous: `convertigo://guides/sql/sql-variable-semantics-you-must-not-guess-3`. Next: `convertigo://guides/sql/schema-learning-workflow`.

---

1. connector exists and loads
2. transaction executes
3. result shape is understood
4. business sequence mapping is correct

### Pattern 2: CRUD behind a business sequence
Use SQL transactions as the implementation layer, not the public API.

Good business sequence:

```json
{
  "status": "ok",
  "source": "sql",
  "items": [{ "id": "42", "label": "Alice" }],
  "total": 1,
  "error": ""
}
```

Bad leakage:

```json
{
  "rows": [{ "user_id": "42", "user_name": "Alice" }],
  "rowCount": 1
}
```

The transaction may return raw rows, but the business sequence must not expose them directly unless the contract explicitly chose that shape.

### Pattern 3: deterministic write validation
When validating create/update/delete:
- use deterministic IDs or business keys
- know exactly what row is being created or updated
- clean up after the test if the scenario is not intentionally persistent

Why this is the right way:
- the same scenario can be replayed
- write proof does not pollute shared data unpredictably

Common trap:
- validating writes on shared mutable data with no cleanup path

## Parameter handling

### Parameters must stay explicit
Do not bury dynamic SQL behavior inside brittle string assembly.

Good principle:
- treat input variables as parameters
- keep the transaction query and business sequence contract readable

Common trap:
- direct interpolation of untrusted values into SQL text

### Safe/default rule
Default to `{variable}` whenever the variable is a value in the `WHERE` clause.

Escalate to `{{variable}}` only when:
- the SQL fragment must appear outside `WHERE`
- the fragment is computed intentionally upstream
- the source is controlled and reviewed

If the task says “support search, paging, sort, or a computed clause”:
- keep the public business sequence contract stable
- decide explicitly which parts are values and which parts are raw SQL fragments
- do not improvise the split inside a large query string

## Transaction authoring model

### Where variables live
In Convertigo SQL work, the connector owns the connection and the transaction owns:
- the SQL query
- the transaction variables
- output mode and row/column XML shape
- optional execution details such as max results and auto-commit mode

The business sequence owns:
- API inputs
- nominal/error output
- remapping from transaction shape into public contract fields

### What to expect before first execution
Before the first execution:
- the query may already auto-declare variables from placeholders
- the raw XML shape is still only a hypothesis
- source picker confidence is low until runtime proof exists

After the first successful execution:
- the transaction has a real result shape
- `recordSchema=true` can persist the response schema
- downstream backend and UI mapping becomes much safer

Common trap:
- writing a lot of business sequence mapping before the transaction has ever run once

