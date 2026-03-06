# Mismatch Summary

## Baseline

- Live server version: `0.0.9`
- Repeated checks stayed stable: `21` tools, `9` resources, `1` prompt
- The live contract is tree-first:
  - inspection: `databaseobject-tree-get`
  - mutation: `databaseobject-tree-apply`
  - orchestration: `batch-call`
  - validation: `requestable-execute`
- Two built-in resources already form a strong onboarding seed for the next guide rewrite:
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

No open Phase 0 mismatch remains between:

- the live MCP contract
- the served resources
- the exposed prompt
- the tracked prompt-based tests

The earlier CRUD-era guidance has been removed from the current onboarding surface.

## Stable or reusable material

- `resources/convertigo_context_api.md`
  - Still valid. It documents runtime guardrails rather than obsolete MCP flow.
- `TOOLS.md`
  - Keep as a short human companion to `tools/list`, not as a second contract source.
- `resources/convertigo_transaction_quickstart.md`
  - HTTP advice remains useful and now sits on the tree-based authoring model.
- `resources/convertigo_json_quickref.md`
  - Step semantics remain useful as specialized reference material.

## Phase 1 consolidation order

1. Create one canonical start guide from the live contract and the built-in resources.
2. Reduce overlap across the sequence, transaction, UI, and JSON reference guides.
3. Keep the exposed prompt short and make it point to the canonical start guide plus selected specialized guides.
4. Grow the benchmark and critic material from the now-stable live contract.
5. Refresh `resources_index.json` descriptions only when Phase 1 guide boundaries are finalized.

## Phase 0 decision

- Treat Phase 0 as closed on the current reviewed catalog and onboarding surface.
- Treat tree-based authoring as canonical.
- Treat colleague repositories as pattern sources for roles, validation gates, and benchmark discipline only.
