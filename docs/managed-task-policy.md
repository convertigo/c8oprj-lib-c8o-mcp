# Managed task execution

Constructor tasks require Linux and a usable `c8o-agent-sandbox` Landlock helper.
This requirement also applies to local Studio callers. On other platforms, or
when the helper cannot confine the command, the runner returns an error before
starting the task. It never falls back to an unconfined command.

The host resolves the helper from `convertigo.agent.sandbox.helper`, the Bridge
project's shipped helper, or `/usr/local/bin/c8o-agent-sandbox`. Tool inputs cannot
select it. A confined version check requires the managed runtime version named
in `node/managed_task_sandbox.cjs`; runtime updates require reviewing this policy.

Only the selected project's directory and the task's output/home are writable.
System and runtime directories are readable. The task has its own home, cache
and temporary directory. Landlock restricts filesystem access, not the network.

The generated tool list permits the selected MCP server, task tracking and skill
loading. Legacy constructor tasks also permit native file editing within the
confined directories; capability-pack tasks use their MCP tools for file edits.
Shell, web tools, background processes and nested agents are not enabled.
Profile-specific disabled tool lists further narrow the available MCP tools.

Headless approval is used only with the explicit tool list and verified helper.
It is not a filesystem boundary. Any additional headless launch path must use
the same policy or refuse execution. The browser verifier uses its own API loop
and does not start a headless CLI process.

Validation: `node --test tests/scripts/validate_managed_task_sandbox.cjs`, plus
the constructor tests for both profiles. Mocked Linux tests check command
construction and failure paths; native Linux execution remains a separate
qualification requirement.
