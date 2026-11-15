# Backend review doctrine

Read when: Backend review doctrine. Summary: `convertigo://guides/review`.
Previous: `convertigo://guides/review/overview`. Next: `convertigo://guides/review/frontend-review-doctrine`.

---

## Backend review doctrine

Review backend projects around these families first:

- authentication and authorization
- administration and back-office entry points
- imports, exports, files, document generation, mail
- generic SQL helpers and dynamic filtering
- requestable transactions
- version governance of the project and its references

### Exposure rules

Reason from effective runtime exposure, not from missing-property wording:

- if `accessibility` is absent on a sequence, the sequence is effectively `Public`
- if `accessibility` is absent on a transaction, the transaction is effectively `Private`
- if `authenticatedContextRequired` is absent, it is effectively `false`

Use these meanings:

- `Public`: callable by any client and visible in Test Platform
- `Hidden`: still callable by any client; it is only hidden from Test Platform and WSDL. Without `authenticatedContextRequired=true`, a Hidden sequence is anonymous.
- `Private`: blocked for direct `.json`/`.xml` calls; callable from another sequence

Two runtime rules change the effective exposure:

- URL mappings (`UrlMapper`) ignore `accessibility`: a `Private` target behind a mapping is reachable from outside, and only its `authenticatedContextRequired` protects it.
- Internal calls (`SequenceStep`, `TransactionStep`) bypass `accessibility`: anything an anonymous sequence calls is anonymously reachable too.

Also check the project `corsOrigin`: `=Origin` (the engine default through `=Global`) echoes any caller origin with credentials, so any website can call Hidden sequences in a logged-in browser unless the engine enables `convertigo.xsrf.projects`.

Review doctrine:

- do not recommend "define accessibility" when the real issue is effective `Public`
- do not recommend "define authenticatedContextRequired" when the real issue is effective `false`
- phrase recommendations as hardening targets: `Public -> Hidden`, `Public -> Private`, `false -> true`

Expected default stance in reviews:

- `Public` should be exceptional and deliberate
- business sequences should usually be `Hidden + authenticatedContextRequired=true`
- internal helpers should usually be `Private`
- transactions that do not need direct requestable exposure should not remain requestable by convenience alone

Before recommending `Private`, map visible callers first:

- frontend calls
- other sequences
- shared actions/components if visible from the frontend

### Backend hot spots

Always check:

- mail flows such as `SmtpStep`
- file and temporary output writes
- fixed export filenames
- dynamic SQL markers and SQL built by concatenation
- generic CRUD or table-driven helpers
- `todo`, `debugger`, `Test_Case`, disabled nodes

### Backend governance rule

Always review branches/tags governance on:

- referenced projects
- the project repository itself

If the project itself is not governed by an identifiable branch/tag strategy, state the consequence explicitly:

- inability to reconstitute a delivered version reliably
- inability to `checkout` and restore a known-good version cleanly

