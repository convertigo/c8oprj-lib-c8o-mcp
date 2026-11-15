# Ordered calls, error results and headless execution

Read when: Ordered calls, error results and headless execution. Summary: `convertigo://guides/vibe`.
Previous: `convertigo://guides/vibe/setup`. Next: `convertigo://guides/vibe/starter-http`.

---

## MCP call discipline
- Use `Convertigo_requestable-execute` only for existing Convertigo requestables such as `lib_ConvertigoMCP.mcp_resources_read`.
- Do not invent requestable names such as `lib_ConvertigoMCP.resources/templates/list`.
- Do not pass a guide URI to `mcp_resources_list`; list is for catalog discovery, read is for one URI.
- When a guide URI is already known, skip list retries and call `lib_ConvertigoMCP.mcp_resources_read` directly.
- Treat a `status:"partial"`, skipped property, or failed palette creation as a failed mutation to correct before continuing.
- A Convertigo tool that fails answers Vibe with a result, not an exception: `{error: {code, message, details}}`, the message naming the cause. In `run_typescript`, check `result.error` after each call and read its message before retrying. A generator or a `databaseobject-tree-apply` that fails has changed nothing; a `batch-call` reports each of its calls.
- In Vibe, the MCP tool calls of one assistant message run concurrently, each over its own MCP session. Send independent reads together. Delete then recreate, create then patch, patch then execute, create directive then add children, and save/open/readback sequences are ordered: one `Convertigo_batch-call`, or separate awaited messages, never side by side in one message. If an object name changes because create raced with delete, clean it up before continuing.
- In headless mode, never end with an assistant message that only says work will continue in a later message. If the next step is a mutation, issue the MCP tool call in the same message. If you cannot continue, save if useful and provide a final answer that clearly says the run is incomplete and names the missing proof.

## Headless loop prompt
Keep the user prompt short. It should state the skill and the goal, not the Convertigo implementation rules.

Example:

```text
Use the convertigo-vibe-generalist skill from the Convertigo MCP. Create a Convertigo project named <ProjectName> that implements <short product goal>. Work autonomously and provide proof.
```

The skill and MCP guides must provide the Convertigo constraints: exact naming, starter import, data-page recipe, local variables, SC bindings, generated-artifact boundaries, validation, and save discipline.

When restricting tools in headless mode, repeat `--enabled-tools` once per tool. Do not pass a comma-separated list.

```bash
VIBE_HOME=/path/to/isolated/vibe-home vibe \
  -p "Use the convertigo-vibe-generalist skill from the Convertigo MCP. Create a Convertigo project named <ProjectName> that implements <short product goal>. Work autonomously and provide proof." \
  --output json \
  --agent auto-approve \
  --trust \
  --enabled-tools skill \
  --enabled-tools Convertigo_project-list \
  --enabled-tools Convertigo_requestable-execute \
  --enabled-tools Convertigo_databaseobject-tree-get \
  --enabled-tools Convertigo_databaseobject-tree-apply \
  --enabled-tools Convertigo_databaseobject-delete \
  --enabled-tools Convertigo_mobile-builder-open \
  --enabled-tools Convertigo_project-save
```

The JSON output includes `reasoning_content`, tool calls, tool results, and the final assistant answer. Use it as the primary evidence stream for Vibe-loop scoring.

