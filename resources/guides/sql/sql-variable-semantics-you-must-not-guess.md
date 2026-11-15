# SQL variable semantics you must not guess

Read when: SQL variable semantics you must not guess. Summary: `convertigo://guides/sql`.
Previous: `convertigo://guides/sql/sql-connector-rules-that-matter`. Next: `convertigo://guides/sql/sql-variable-semantics-you-must-not-guess-2`.

---

## SQL variable semantics you must not guess

### `{variable}` means safe parameter-style substitution
Use `{variable}` when the variable is a value that belongs in the `WHERE` clause.

What Convertigo guarantees:
- it protects the query against SQL injection by keeping only the first represented value
- it behaves like a value placeholder, not a raw SQL fragment
- it is the default safe path when the query condition is value-based

Why this is the right way:
- the transaction stays readable
- variables stay declarative
- the agent does not have to invent ad hoc escaping rules

Common trap:
- trying to use `{variable}` outside the `WHERE` clause and then “fixing” the query with raw concatenation

### `{{variable}}` means raw SQL text replacement
Use `{{variable}}` only when the query needs a raw SQL fragment, such as:
- a computed `WHERE` clause assembled earlier in the sequence
- a clause or expression that must appear outside the `WHERE` clause
- a controlled vendor-specific fragment that cannot be expressed as a value placeholder

What Convertigo does not guarantee:
- no SQL injection protection
- no value-only constraint
- no safety if the source value contains arbitrary SQL text

Why this is dangerous:
- the query may execute unintended SQL
- user-controlled values become unsafe immediately

Common trap:
- using `{{variable}}` for ordinary user input just because it “works everywhere”

### Variables are auto-declared from SQL placeholders
A `{{variable}}` carries one statement at most: the engine splits the SQL on `;` before it replaces `{{...}}`, so a value holding several statements (a whole seed script) runs as one statement and fails with `unexpected token`. Write a multi-statement script in the transaction's SQL itself, separated by `;`, or use one transaction per statement.

A `{variable}` is a bound JDBC parameter, which a DDL statement does not take: `CREATE`, `ALTER` or `DROP` with `{variable}` fails (HSQLDB: `unexpected token: ?`). Write the value in the SQL, or use `{{variable}}` for a value you control; `sql-transaction-create` warns about it.

When the query contains `{variable}` or `{{variable}}`, Convertigo auto-declares the transaction variable if it does not already exist.

What to expect:
- the first saved transaction can already expose variables derived from the query
- the variable still needs a deliberate runtime value or test value to prove the transaction
- auto-declaration is a convenience, not a substitute for understanding what the variable means

Why this matters:
- the agent can scaffold a transaction quickly from the query text
- later mapping and source picking depend on these variables being understood, not only present

Minimum validation proof:
- the variable appears on the transaction
- one execution with representative input proves the intended substitution path

`sql-transaction-create` applies the rules of this section: from a structured `select` it writes the quoted camelCase aliases, the optional filters, the `contains` and `POSITION` list filters itself, and it refuses SQL text that breaks one of them, with the fix in the message.

### Result keys follow the database's identifier case
`sql_output` rows are keyed by the column labels the driver returns. HSQLDB and Oracle upper-case unquoted identifiers, PostgreSQL lower-cases them (MariaDB/MySQL and SQL Server keep them as written): `SELECT id, order_number AS orderNum` gives `ID` and `ORDERNUM`, so JavaScript reading `row.id` gets `undefined`. Give every selected column a quoted alias in the case your code reads, `SELECT id AS "id", order_number AS "orderNumber"`, and read those exact keys (checked on HSQLDB: the quoted alias `"orderLabel"` keeps its case).

