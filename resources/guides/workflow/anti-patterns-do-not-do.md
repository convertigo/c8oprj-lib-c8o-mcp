# Anti-patterns / do not do

Read when: Anti-patterns / do not do. Summary: `convertigo://guides/workflow`.
Previous: `convertigo://guides/workflow/overview`.

---

## Anti-patterns / do not do
- Do not declare success without runtime evidence.
- Do not hide a failed validation behind a structural diff.
- Do not use RAG for basic tool names, parameter syntax, or the canonical workflow.
- Do not silently fall back to direct YAML edits and report success as if MCP handled the task cleanly.
- Do not let one agent or one patch mix unrelated concerns when a smaller reviewable change is possible.
- Do not reload automatically after every write. Reload only when it provides useful proof.
- Do not use `project-reload` just to "refresh" `requestable-execute`. Live memory should already be authoritative.
- Do not call `project-reload` on the active MCP server project. That operation is forbidden; persist MCP project edits with `project-save`.

## Completion checks
- The final result names the changed objects or requestables.
- The final result includes concrete validation evidence.
- The validation mode matched the task shape.
- Save happened after successful validation.
- Reload and smoke checks happened only when structural runtime assets changed or reload proof mattered.
- Any remaining risk or missing MCP primitive is stated explicitly.
