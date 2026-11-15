# Constructor lots and verifier runs

Read when: Constructor lots and verifier runs. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/progress`. Next: `convertigo://guides/common/names-secrets`.

---

## Sub-agents: keep the main context small

When your tool list has no `subagent-run`, `browser-verify` or `image-describe` (Claude agents: those tools would call another model), the same rules apply with your own host: hand each large piece to your own sub-agent tool with a self-contained task and the report you need, do the browser proofs with your Playwright tools and look at the screenshots yourself, and review the texts the user sees yourself (`project-lint` then skips TEXT-REVIEW).

Every model step pays the whole conversation again: a build driven in one context grows to hundreds of thousands of tokens. Hand each large piece to a sub-agent with `subagent-run`: it starts with a fresh context, its own model and limits, does the piece and returns a short report; its context is then thrown away.
- What stays in your context: the specification, the plan and the lots, the decisions, the object inventory and the reports. What goes to a sub-agent: the building of a lot (profile `constructor`) and the clicks, screenshots and reads of a proof (profile `verifier`, below in Validation and evidence).
- Delegate every build that creates objects (a page, sequences, transactions, test sequences), even a small one, to a constructor: `subagent-run({profile:"constructor", task, inputs:{project, qnames, files, notes}, reportFormat})`. Keep for yourself only small edits of existing objects (a property, a label, one fix). Cut lots so one run does one coherent piece in one project: "the transactions and business sequences of lot 3", "the page Stats with its list", "the test sequences of lot 8". The task names every object to create with its exact name, the existing objects to use (QNames in `inputs.qnames`), the rules and values that matter, and how to prove it (the requestable to run and the result expected). The constructor builds with its own context and its own GLM session, proves its pieces with `requestable-execute` and the builder, saves, and reports the QNames it created and modified, its checks and its open issues.
- One constructor at a time per project, and nobody else writes that project while it runs: the MCP refuses your writes to it until its report comes. Reading stays allowed.
- After its report: read back what you need with `databaseobject-tree-get` on the QNames it lists (not the whole project), check its checks, then prove the lot with a verifier run. Fix a small gap yourself or send a new constructor run with a precise task; never rerun the same task unchanged.
- A good task is self-contained: the sub-agent knows only `task`, `inputs`, `reportFormat` and its profile. Name the exact objects, URLs, accounts and expected values; ask for the report you need to decide (for example one line per check with the exact text seen).
- A call answers within 45 s: on `status:"running"`, call `subagent-run({runId:"<the id>"})` alone until `status:"finished"`; `activity` shows its latest steps. That call is the wait: never poll the run folder with shell commands or sleeps. Never start a second sub-agent on the same browser or project meanwhile.
- Keep the report, not the details: copy its verdict, findings and screenshot paths into `PROGRESS.md` for the lot. The run folder (`reportFile`) keeps the full trace if you need it later.
- Limits per profile (`maxSteps`, `timeBudgetSec`, `maxCostUsd`) end a run with what it has (`stopReason`); a smaller piece is better than a larger budget.

