# Recommended MCP tools

Read when: Recommended MCP tools. Summary: `convertigo://guides/proof`.
Previous: `convertigo://guides/proof/mandatory-workflow`.

---

## Recommended MCP tools
- `requestable-execute`
- `log-view`
- `subagent-run`
- `browser-verify`
- `image-describe`
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
