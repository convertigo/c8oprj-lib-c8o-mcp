# Idempotent seeds, credentials and login proof

Read when: Idempotent seeds, credentials and login proof. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/proof-results`. Next: `convertigo://guides/common/tigo`.

---

## Seed and visible data

- Prefer realistic seed data by default.
- A seed or setup sequence (demo rows, a demo account, a first administrator) checks the answer of each call it makes, library calls included: an `IfExistThenElseStep` on the call's `./document/error` whose then branch ends with an `XMLErrorStep`, so a failure fails the seed loudly. It answers what it did from those answers (created, already there), never a constant `ok`. `project-lint` reports a writing call whose answer no step reads (`SEQ-CALL-UNCHECKED`) and a constant success after it (`SEQ-CONSTANT-SUCCESS`).
- A step is not a JavaScript variable: `typeof MyStep` or `MyStep.document` reads `undefined`, so a test on it always takes the same branch (a "the table is empty" test that reseeds on every call). Put the step's output in a variable with a `JsonSourceStep` or `SimpleSourceStep` on its `./document`, or source the step variable of the next call from it (`SEQ-STEP-AS-VARIABLE`).
- A seed that writes is never left callable without authentication: make it `Private` and run it from a scheduler job (`scheduler-apply`) or from an administrator's sequence (`Hidden`, `authenticatedContextRequired=true`, role checked inside) that calls it, or delete it once the server is initialized. When the user asks for a public seed, build it that way and say why. `project-lint` reports a public write (`SEC-ANONYMOUS-WRITE`) even when it goes through another sequence or a library.
- A demo password is never a literal in the project, and never emptied to quiet the audit: an account created with an empty password accepts no sign-in. Make it an input of the seed (a variable with `visibility` 15 and no default, given by whoever runs it: `requestable-execute` in the Studio, the administrator's sequence on a server) or a `.secret` symbol with an empty default the server defines (`${<app>.demo.password.secret=}`), and make the seed answer an error when it is empty.
- Prove what a seed claims before reporting it: run it where its data or account does not exist yet (before creating the account any other way: an account made by hand in the Studio hides a seed that creates nothing), then sign in with the demo credentials through the app's login sequence (`requestable-execute`) or `browser-verify`. Report the demo account only once that sign-in works.
- Prefer semantic preview fields such as `name`, `title`, `city`, `email`, or `comment` over `id` when a visible choice exists.
