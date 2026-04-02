# Convertigo Engineering Workflow

## When to read this
Read this for any non-trivial task, any multi-step feature, or any run that should end with reviewable evidence.

## What this guide covers
- How to keep changes reviewable.
- What counts as evidence before completion.
- How to use validation discipline instead of intuition.
- When RAG is acceptable and when it is not.
- How to capture MCP tooling friction without hiding it.

## Mandatory workflow

### Patch slicing rules
1. Keep one clear intent per mutation set.
2. Use a single `databaseobject-tree-apply` when one subtree can express the whole change clearly.
3. Use `batch-call` when:
   - several operations belong to the same intent
   - ordering matters
   - you want one final mutation finalize step
4. Do not use `batch-call` for exploration. Discovery stays read-only.
5. Reload only when the task changed structural runtime assets and you need proof that the project reloads cleanly.
6. Treat `project-reload` as rollback to disk, not as a freshness mechanism for live memory.
7. Never reload the active MCP server project itself; use `project-save` there because reloading it unloads the endpoint.

### Validation decision table

| Situation | Minimum proof |
| --- | --- |
| Response-shape change in one sequence or transaction | `requestable-execute` only (live Studio memory) |
| Runtime behavior is unclear from the payload alone | `requestable-execute` plus targeted `log-view` |
| Metadata-only or non-runtime-safe change | focused `databaseobject-tree-get` readback, then `project-save` |
| Sequence, connector, transaction, or NGX structure changed and reload matters | `project-save`, `project-reload` (use `fromJson=true` when JSON mirrors were edited), then minimal smoke |

### Evidence before done
Keep evidence before declaring success:
- a successful `requestable-execute` when runtime behavior changed
- a focused `databaseobject-tree-get` readback when structure changed
- `log-view` output only when execution or transport details matter
- save after successful checks
- reload plus smoke only when the task shape requires it
- if runtime proof is stale after save, treat it as a tooling defect to report, not as a cue to normalize `project-reload`

### Final answer template

```text
Changed:
- <object or requestable names>

Validated:
- <one or two concrete successful checks>

Saved:
- yes|no

Reloaded:
- yes|no, with reason

Remaining risk:
- <short note or none>

MCP critique:
- <one short item if tooling friction mattered>
```

### Tooling friction capture
Report MCP friction when it affected the task, but keep it short.

Report:
- the exact missing primitive, ambiguity, or noisy behavior
- the concrete step it slowed down
- whether it was blocking or only inconvenient

Do not report:
- general complaints without a concrete task impact
- long wish lists disconnected from the run

Treat friction as blocking when:
- it prevents a safe MCP-only path
- it makes the result unverifiable
- it hides a contract ambiguity that changes behavior

Treat friction as non-blocking when:
- the task still succeeded safely
- the missing feature cost time but not correctness
- the proof remained clear

## Recommended MCP tools
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `batch-call`
- `requestable-execute`
- `log-view`
- `project-save`
- `project-reload`
- `rag-query`
- `resources/templates/list` when a fast-path/template guide must be selected before reading it through `resources/read`

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
