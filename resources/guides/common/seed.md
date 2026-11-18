# Idempotent seeds, credentials and login proof

Read when: Idempotent seeds, credentials and login proof. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/proof-results`. Next: `convertigo://guides/common/tigo`.

---

## Seed and visible data

- Prefer realistic seed data by default.
- A seed or setup sequence (demo rows, a demo account, a first administrator) checks the answer of each call it makes, library calls included: an `IfExistThenElseStep` on the call's `./document/error` whose then branch ends with an `XMLErrorStep`, so a failure fails the seed loudly. Source each check by the name of its call: `sourceDefinition:{"step":"<call name>","xpath":"./document/error"}`, the call before the check, so one `databaseobject-tree-apply` creates and wires the whole seed. It answers what it did from those answers (created, already there), never a constant `ok`. `project-lint` reports a writing call whose answer no step reads (`SEQ-CALL-UNCHECKED`) and a constant success after it (`SEQ-CONSTANT-SUCCESS`).
- A step is not a JavaScript variable: `typeof MyStep` or `MyStep.document` reads `undefined`, so a test on it always takes the same branch (a "the table is empty" test that reseeds on every call). Put the step's output in a variable with a `JsonSourceStep` or `SimpleSourceStep` on its `./document`, or source the step variable of the next call from it (`SEQ-STEP-AS-VARIABLE`).
- A seed that writes is never left callable without authentication: make it `Private` and run it from a scheduler job (`scheduler-apply`) or from an administrator's sequence (`Hidden`, `authenticatedContextRequired=true`, role checked inside) that calls it, or delete it once the server is initialized. When the user asks for a public seed, build it that way and say why. `project-lint` reports a public write (`SEC-ANONYMOUS-WRITE`) even when it goes through another sequence or a library.
- "Replayable on a fresh server" never means callable anonymously. On a new server the seed runs from a scheduler job (`scheduler-apply`) or by an administrator (`requestable-execute` in the Studio, or an administrator's sequence); it stays `Private`. Never put a `public-write` line on a seed, an init or any job: that line is for a write anyone must be able to make (a public form, a webhook receiver), and `project-lint` keeps the error on a requestable that takes no input variable.
- A demo password is never a literal in the project, and never emptied to quiet the audit: an account created with an empty password accepts no sign-in. Make it an input of the seed (a variable with `visibility` 15 and no default, given by whoever runs it: `requestable-execute` in the Studio, the administrator's sequence on a server) or a `.secret` symbol with an empty default the server defines (`${<app>.demo.password.secret=}`), and make the seed answer an error when it is empty.
- Prove what a seed claims before reporting it: run it where its data or account does not exist yet (before creating the account any other way: an account made by hand in the Studio hides a seed that creates nothing), then sign in with the demo credentials through the app's login sequence (`requestable-execute`) or `browser-verify`. Report the demo account only once that sign-in works.
- Prefer semantic preview fields such as `name`, `title`, `city`, `email`, or `comment` over `id` when a visible choice exists.

## Replay and fresh-server proof

- Prove a seed with `seed-proof` (`requestable`: the seed; `variables` and `authenticatedUser` as `requestable-execute` takes them). It counts the tables the seed writes, runs the seed, counts, runs it again and counts, in one call. It never empties nor deletes a row.
- A replay proof is: the seed answers status ok on a second run, and the counts of the tables it writes are the same after the second run as after the first. `seed-proof` answers `verdict: replayable` only then; `failed` comes with its `reasons`.
- A fresh-server proof is: the tables empty (or the database new), one run answering ok, then the expected counts. `seed-proof` answers `freshRun: true` when every table it counted was empty before its first run. Otherwise it proves the replay on existing data only: say so in the report. Never empty a table to prove a fresh server without the user's OK.
- An answer `status: error` (or any error field) from the seed blocks every success report about it: fix the seed and prove it again. Counts unchanged after an error prove nothing: nothing ran.
- Duplicates are fixed in the seed, never by deleting the extra rows one by one: insert a row only when it is missing (`INSERT ... SELECT ... WHERE NOT EXISTS` on its natural key, or `MERGE`), with a unique key on that natural key.
- `seed-proof` counts the tables the seed's SQL transactions write. Writes it cannot count (CouchDB, FullSync, HTTP) come in `notCounted`: read them back another way before reporting them. Give `tables` (`connector.table`) when the seed writes tables its SQL does not name.
