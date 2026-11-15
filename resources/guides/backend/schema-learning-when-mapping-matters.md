# Schema learning when mapping matters

Read when: Schema learning when mapping matters. Summary: `convertigo://guides/backend`.
Previous: `convertigo://guides/backend/step-taxonomy-that-matters-most-4`. Next: `convertigo://guides/backend/schema-learning-when-mapping-matters-2`.

---

## Schema learning when mapping matters

### Use schema early when the sequence depends on a requestable shape
If a sequence is about to map the result of:
- an SQL transaction
- an HTTP transaction
- another requestable whose structure is not already proven

then schema matters before you finalize the mapping.

Use this workflow:
1. run the requestable with representative input
2. when the requestable is a transaction, use `requestable-execute(..., {"recordSchema": true})`
3. inspect the resulting shape with `databaseobject-schema`
4. source and map against the learned structure, not a guessed one

Why this is the right way:
- business sequence mapping stops being speculative
- source picker decisions become reproducible
- later UI or specialist work inherits a real structure instead of a guess

### When `recordSchema=true` is relevant
`recordSchema=true` is relevant when:
- the target is a transaction, not a sequence
- downstream mapping depends on the raw source shape
- a picker or sourceDefinition will rely on that shape later

It is not a substitute for runtime proof on sequences. It is the persistence step that makes the transaction response inspectable later.

### How `databaseobject-schema` helps
Use `databaseobject-schema` after runtime proof to:
- inspect the current response shape
- confirm field names and nesting before building JSON mapping
- avoid blind XPath/sourceDefinition authoring
- support later picker-driven work without reverse-engineering the raw transaction again

Common trap:
- build the mapping blind, then discover picker/schema pain later when the raw shape differs from the first guess

### `IfStep`, `IfThenElseStep` and `WhileStep` conditions are booleans
The engine accepts only `true` or `false` from a block condition: any other value stops the sequence with `Invalid step condition. Step: "<name>"`. A JavaScript `&&` / `||` chain returns one of its operands, not a boolean, so `resp && resp.success && resp.journal` gives the `resp.journal` object (and `resp && ...` gives `null` when `resp` is null). End the chain with a comparison (`resp.journal != null`, `rows.length > 0`, `resp.success === true`) or wrap it: `!!(resp && resp.journal)`. The number of operands does not matter. tree-apply warns when the last operand is a bare value.

### Object literals in a JS SmartType
A JS expression `{}` or `{ seeded: true }` is read as a block of statements, not an object: it gives `undefined`, and the step fails with a bare `An exception occured while executing step` that names no step. Write `({ seeded: true })`. tree-apply adds the parentheses when an expression is an object literal, and requestable-execute lists the suspicious steps (`error.hints`) when a sequence fails with that empty message.

### `SmtpStep` never fails the sequence
Send a mail with the native `steps.SmtpStep`, as the multipage recipe does: server, port, sender, recipients and subject are its properties, and the body is its source with one `contentType`. Take the server settings from symbols (`${app.smtp.server=localhost}`), with a `.secret` name for the password.

When the send fails (no server, unknown host, closed port), `SmtpStep` logs an ERROR line `Beans (SmtpStep) An error occured while trying to send e-mail : ... Could not connect to SMTP host` and the sequence still answers success; its output holds no status either (checked on Studio 8.4.7). Check a send by hand: run the sequence, then `log-view` with `level:"error"` and `q:"SmtpStep"`.

Send from a `SimpleStep` with `javax.mail` only in two cases:
- the sequence must know whether the mail left, to record a failed notification or retry it: `SmtpStep` gives no status;
- the mail must carry a text and an HTML version (`multipart/alternative`): `SmtpStep` has one body.

