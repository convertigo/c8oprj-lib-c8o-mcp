# Order of work

Read when: Order of work. Summary: `convertigo://guides/multipage`.
Previous: `convertigo://guides/multipage/ngx-pages-2`. Next: `convertigo://guides/multipage/validation`.

---

## Order of work
Keep `docs/generated/PROGRESS.md` up to date with `project-notes-write` after each step below (conventions and decisions, object inventory, checks, next step), as the common skill's "Project notes and resume" section says: it is what a resumed or compacted conversation and every later change of the app start from. Name the demo account there, never its password.

Keep your own context for the specification, the plan, the decisions and the reports, and delegate the heavy work to sub-agents (common skill, "Sub-agents"): build each lot below with a constructor run (one per coherent piece: the transactions and business sequences of a lot, one page, the test sequences), read back the QNames it reports, and close each page lot with one verifier run (`subagent-run`, profile `verifier`) whose paths are the user journeys through that page and whose checks are the specification's acceptance criteria with their exact texts. Copy its verdict and findings into `PROGRESS.md`; fix, rebuild and verify again only the paths that failed.

1. Data model and `SqlTransaction`s (`sql-transaction-create`, several per call), seeded with demo data by a reset sequence; prove each with `requestable-execute`. The reset or seed sequence checks the answer of each call it makes (a library call included) and fails with an `XMLErrorStep` when one fails; it is `Private` (or authenticated with an administrator role check), never callable by anyone (common skill, "Seed and visible data").
2. `js/app.js` with the rules, then the session business sequences, then the other business sequences (`business-sequence-create`).
3. Pages (`ngx-page-create`, then `databaseobject-tree-apply` for what it does not cover), one lot per page.
4. Scheduled or batch logic as a sequence that takes an injectable date for tests. Schedule it with `scheduler-apply({name, project, sequence, cron:"0 0 8 * * ?"})` (Quartz syntax with seconds) and check it with `scheduler-list`. A scheduled run has no user session: the scheduled sequence must not require `authenticatedContextRequired`, and it does its own authorization (for example, it checks a technical parameter or symbol). When the business hour is a setting (for example `app.reminderHour=08:00`), schedule a frequent run (`0 */15 * * * ?`) whose sequence checks the configured hour and is idempotent per day, so changing the setting needs no rescheduling.
5. Non-regression sequences that call the business sequences and assert the contract. A `Private` test sequence can open a session with `context.setAuthenticatedUser(<email>)` and call the protected business sequences through `SequenceStep`: the session reaches them, so one `requestable-execute` runs every acceptance case for one role, then for the next.

In Studio mode the engine does not enforce `Private`: the test sequences, the reset sequence and the scheduled sequence answer a direct HTTP call there, and a test sequence that opens a session gives that session to its caller. A deployed server enforces `Private`. When one of them must not run on a shared or demo server either (a reset that erases the data), make its first step refuse unless a symbol allows it, for example `${app.demoMode=false}` read in a step expression.
