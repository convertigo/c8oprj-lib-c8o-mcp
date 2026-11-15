# Convertigo SQL Integration

Use SqlConnector with the correct driver/JDBC URL and structured transaction variables. Verify the dialect before writing DDL or pagination. A SQL business sequence calls transactions with TransactionStep; never open database connections in a script. Preserve variable names and source producer priorities. Prove a transaction and the stable business contract before UI work, including create/read/update/delete where required. Do not infer SQL success from metadata. Inspect/mutate through MCP and project-save after proof.

## Drawers
- `convertigo://guides/sql/overview` — Scope, prerequisites and route selection.
- `convertigo://guides/sql/sql-connector-rules-that-matter` — SQL connector rules that matter.
- `convertigo://guides/sql/sql-variable-semantics-you-must-not-guess` — SQL variable semantics you must not guess.
- `convertigo://guides/sql/sql-variable-semantics-you-must-not-guess-2` — Bound parameters and SQL validation failures.
- `convertigo://guides/sql/sql-variable-semantics-you-must-not-guess-3` — Dialect functions and SQL variable handling.
- `convertigo://guides/sql/sql-variable-semantics-you-must-not-guess-4` — Transaction authoring and schema-proof sequence.
- `convertigo://guides/sql/schema-learning-workflow` — Schema learning workflow.
- `convertigo://guides/sql/driver-specific-subtleties-to-teach-the-ag` — Driver-specific subtleties to teach the agent.
