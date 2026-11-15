# Schema learning workflow

Read when: Schema learning workflow. Summary: `convertigo://guides/sql`.
Previous: `convertigo://guides/sql/sql-variable-semantics-you-must-not-guess-4`. Next: `convertigo://guides/sql/driver-specific-subtleties-to-teach-the-ag`.

---

## Schema learning workflow

### Use runtime first, then persist the schema
When SQL work will feed business sequence mapping, source pickers, or later UI work:
1. execute the transaction with representative variables
2. use `requestable-execute(..., {"recordSchema": true})` on the transaction path
3. read the persisted shape with `databaseobject-schema`
4. only then finalize backend mapping and any picker-dependent work

Why this is the right way:
- schema stops being guesswork
- source picker choices become deliberate
- the UI and backend can align on a real structure

### Schema is not only documentation
Treat schema as:
- the current proof of the transaction shape
- a mapping aid for business sequence design
- a prerequisite for later picker-assisted data binding

Common trap:
- building the business sequence blind, then discovering picker/schema pain later when the raw transaction shape finally differs

Minimum validation proof:
- one transaction execution with `recordSchema=true`
- one `databaseobject-schema` read proving the learned shape exists
- one business sequence validation using the real transaction shape

### Double goal: speed and safety
The agent should be fast, but not by skipping parameter discipline.

Fast path:
- simple deterministic read query
- explicit variables
- explicit business sequence mapping

Not acceptable fast path:
- giant query string assembled ad hoc with unchecked values

## CRUD scaffold pattern

### Read list
1. public business sequence inputs for filter/search/paging if needed
2. SQL transaction for list
3. explicit mapping into `items`
4. explicit `total`

### Read detail
1. one stable identifier input
2. SQL transaction for detail lookup
3. explicit not-found behavior

### Create/update/delete
1. stable input variables
2. deterministic validation payload
3. explicit success/error mapping
4. cleanup or rollback strategy for tests when needed

Why this is the right way:
- it composes into enterprise CRUD without rethinking the basics every time

## Source-picker implications

### SQL schema feeds later source work
Even though SQL transactions produce XML-shaped output under `sql_output`, later sequence steps still depend on:
- the real row/column shape
- the chosen output mode
- stable column names and nesting

If schema is missing:
- source picker choices become fragile
- business sequence mapping tends to hard-code guessed paths
- UI work will inherit uncertainty

### Output mode changes picker ergonomics
`RAW`, `AUTO`, `ELEMENT`, `ELEMENT_WITH_ATTRIBUTES`, and `FLAT_ELEMENT` do not only change documentation. They change:
- how rows are nested
- whether columns appear as attributes or elements
- how easy it is to source text cleanly downstream

Rule of thumb:
- pick the output mode deliberately
- record the schema
- source the exact text nodes or elements the business sequence needs
