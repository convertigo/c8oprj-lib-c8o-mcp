# Mandatory workflow

Read when: Mandatory workflow. Summary: `convertigo://guides/proof`.
Previous: `convertigo://guides/proof/overview`. Next: `convertigo://guides/proof/recommended-mcp-tools`.

---

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
  - direct transaction or business sequence execution
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
  - functional and visual browser proof: one verifier sub-agent run (`subagent-run` profile `verifier`, or `browser-verify`) with the paths in plain language and the acceptance checks; its vision sub-agent drives the viewer and reports each check with evidence, the visual defects and its screenshots. Fix what it reports and verify the affected paths again
  - without a verifier, when layout or style is an acceptance criterion and your model cannot read images: a Playwright screenshot saved with `filename`, then `image-describe` with that file as `path` and a precise question

### Concise vs noisy proof
Acceptable proof:
- one successful requestable call
- one short structural confirmation
- one short remaining-risk note
Noisy proof:
- full raw logs without focus
- repeated payload dumps for the same success
- long commentary without one concrete runtime proof

