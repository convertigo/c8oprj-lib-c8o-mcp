# Mismatch Summary

## Baseline

- Live server version: `0.0.11`
- Repeated checks stayed stable: `21` tools, `12` resources, `7` prompts
- The live contract is tree-first:
  - inspection: `databaseobject-tree-get`
  - mutation: `databaseobject-tree-apply`
  - orchestration: `batch-call`
  - validation: `requestable-execute`
- Two built-in resources still form the first onboarding seed:
  - `convertigo://capabilities`
  - `convertigo://recipes/quickstart`

## Autodoc status

- The live tool catalog now exposes distinct titles and descriptions for all `21` tools.
- Visible input parameter help has been rewritten for the live surface, including previously weak tools such as `batch-call`, `databaseobject-tree-get`, `databaseobject-tree-apply`, `project-js-get`, `project-js-set`, and `requestable-execute`.
- Phase 0.5 has cleaned the core output contract:
  - `batch-call`
  - `databaseobject-tree-apply`
  - `databaseobject-tree-get`
  - `log-view`
  - `requestable-execute`
  - `mobile-builder-open`
- The reviewed live catalog no longer has an open output-contract backlog.
- The last `8` input-schema ambiguities have been closed with typed booleans, integers, and enums in `tools/list`.

## Current mismatch status

No open catalog mismatch remains between:

- the live MCP contract
- the served resources
- the exposed role prompts
- the tracked prompt-based tests and probes

The earlier CRUD-era guidance is gone from the current onboarding surface, and the public prompt layer is now role-based.

## Stable or reusable material

- `resources/convertigo_context_api.md`
  - Still valid. It documents runtime guardrails rather than obsolete MCP flow.
- `TOOLS.md`
  - Keep as a short human companion to `tools/list`, not as a second contract source.
- `resources/convertigo_json_quickref.md`
  - Step semantics remain useful as specialized reference material.
- `tests/prompt_facade_stub_probe.txt`, `tests/prompt_http_facade_probe.txt`, `tests/prompt_ngx_contract_probe.txt`
  - These now act as the first live prompt probes and should become benchmark seeds in Phase 3.

## Phase 2 validation status

- Mandatory probes passed:
  - planner
  - HTTP
  - frontend NGX
- The critic prompt completed a live review run and produced actionable findings.
- The backend sanity run is intentionally recorded as incomplete, not hidden:
  - the prompt explored correctly
  - it never reached mutation, validation, or save
  - the critic captured the failure and the MCP UX issue behind it
- The SQL prompt is published and metadata-complete, but no live database-backed probe was run because no safe local SQL target is available.

## Next review focus

1. Turn probe logs and critique output into structured run reports.
2. Add benchmark scoring on top of the existing planner, HTTP, and frontend probes.
3. Refine the backend prompt and scenario so a short sequence-authoring sanity run reaches write, runtime proof, and save reliably.
4. Keep colleague repositories as pattern sources for roles, validation gates, and benchmark discipline only.
