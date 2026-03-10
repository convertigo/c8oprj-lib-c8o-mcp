# Convertigo Validation and Evidence

## When to read this
Read this before declaring a task done, and use it as the closure checklist for critic and benchmark work later.

## What this guide covers
- The minimum validation expected before closure.
- Save and reload discipline.
- What evidence should appear in a final result.
- How to capture failures or MCP friction without noise.

## Mandatory workflow

### Final-proof template
```text
Changed:
- <objects or requestables>
Runtime proof:
- <successful requestable-execute or equivalent>
Structural proof:
- <focused tree-get readback, if relevant>
Saved:
- yes|no
Reloaded:
- yes|no, with reason
Remaining risk:
- <short note or none>
MCP critique:
- <one short item if needed>
```

### Reload decision table
| Situation | Reload needed? |
| --- | --- |
| Only guide, prompt, or non-runtime text changed | no |
| Sequence, connector, transaction, or runtime structure changed and reload proof matters | yes |
| Metadata-only tree change with no runtime consequence | usually no |
| UI or requestable work where final confidence depends on clean reload | yes |

### Minimal smoke by task type
- Backend sequence:
  - one successful `requestable-execute`
  - one structural readback when the tree changed
- HTTP integration:
  - direct transaction or facade execution
  - transport or schema evidence when needed
- SQL integration:
  - deterministic read-path proof
  - cleanup-aware write proof only when the task needs it
- UI:
  - structure readback
  - runtime evidence when available
  - if browser smoke fails, inspect builder logs with `mobile-builder-open` output and `log-view` before deciding whether the build failed
  - explicit loading, empty, error, and retry presence when the page depends on data

### Concise vs noisy proof
Acceptable proof:
- one successful requestable call
- one short structural confirmation
- one short remaining-risk note
Noisy proof:
- full raw logs without focus
- repeated payload dumps for the same success
- long commentary without one concrete runtime proof

## Recommended MCP tools
- `requestable-execute`
- `log-view`
- `databaseobject-tree-get`
- `batch-call`
- `project-save`
- `project-reload`

## Anti-patterns / do not do
- Do not finish on structural intuition alone.
- Do not skip save or reload when the task changed runtime structure and reload proof matters.
- Do not flood the final result with raw logs when one focused proof is enough.
- Do not hide unresolved risk or tooling gaps.

### Failure-pattern reminders
- Runtime changed but only structure was checked.
- UI browser smoke failed, but build logs were never inspected.
- Save happened before validation instead of after it.
- Reload was skipped even though runtime structure changed and clean reload mattered.
- Final answer says "done" without naming one concrete proof.

## Completion checks
- At least one runtime proof exists for the changed behavior.
- Structural readback confirms the expected final state when relevant.
- Save completed successfully.
- Reload and post-reload smoke checks happened when required.
- The final response is concise, evidenced, and explicit about remaining risks.
