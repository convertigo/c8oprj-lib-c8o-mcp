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

`requestable-execute` validates the live in-memory Studio state. Use `project-reload` only when you intentionally want to prove rollback-to-disk or reload cleanliness.
Never reload the active MCP server project itself; use `project-save` there because reload unloads the running endpoint.

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
  - runtime evidence when the builder is healthy
  - browser smoke should attach Playwright or the browser-control MCP only when `mobile-builder-open` reports `browserControlReady:true`; if `browserControlTargetUrl` is `about:blank`, keep polling because the Studio loader is still building; if those MCP browser tools are unavailable, disabled, stale, or attached elsewhere, report the managed Playwright MCP configuration problem instead of using Node scripts, raw CDP, or a separate browser
  - launch the viewer once with `wait=false`; do not probe `stateOnly=true` first. When the launch reports a Node download, npm install, or cold Angular build, finish useful mutations and use one waited state check with `timeoutSec:180` instead of repeated 30-second polls
  - if a waited `mobile-builder-open` reports `compile_error`, treat that as the canonical compile proof and fix the source objects or MCP generator path, not the generated frontend artifacts
  - if browser smoke fails, inspect builder logs with the latest waited `mobile-builder-open` output and `log-view` before deciding whether the build failed
  - explicit loading, empty, error, and retry presence when the page depends on data
  - `project-save` after the last successful UI mutation
  - do not treat `mobile-builder-open ready=true` as a substitute for browser smoke

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
- `resources/templates/list` when a validation or delivery guide points to a template-bearing fast path

## Anti-patterns / do not do
- Do not finish on structural intuition alone.
- Do not skip save or reload when the task changed runtime structure and reload proof matters.
- Do not use reload as a substitute for live-memory runtime proof.
- Do not flood the final result with raw logs when one focused proof is enough.
- Do not recursively search drive roots, user profiles, workspace roots, or generated frontend trees for viewer diagnostics. Use the latest builder result, `log-view`, and the managed Playwright page.
- Do not hide unresolved risk or tooling gaps.

### Failure-pattern reminders
- Runtime changed but only structure was checked.
- UI browser smoke failed, but build logs were never inspected.
- UI changes were never saved, but the run still claimed success.
- Builder was healthy, browser smoke was skipped, and the run still claimed success.
- Save happened before validation instead of after it.
- Reload was skipped even though runtime structure changed and clean reload mattered.
- Final answer says "done" without naming one concrete proof.

## Completion checks
- At least one runtime proof exists for the changed behavior.
- Structural readback confirms the expected final state when relevant.
- Save completed successfully.
- Reload and post-reload smoke checks happened when required.
- The final response is concise, evidenced, and explicit about remaining risks.
