# Mismatch Summary

## Baseline

- Live server version: `0.0.8`
- Repeated checks stayed stable: `21` tools, `9` resources, `1` prompt
- The live contract is tree-first:
  - inspection: `databaseobject-tree-get`
  - mutation: `databaseobject-tree-apply`
  - orchestration: `batch-call`
  - validation: `requestable-execute`
- Two built-in resources already form a better onboarding seed than most file-based guides:
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

## Highest-risk mismatches

1. `resources/convertigo_mcp_usage.md`
   - Still teaches removed `databaseobject-children`, `databaseobject-create`, and `databaseobject-properties-*` flows.
2. `resources/convertigo_sequence_quickstart.md`
   - Still instructs sequence authoring through removed create and property tools.
3. `resources/convertigo_ui_building_quickstart.md`
   - Still instructs UI work through removed creation and property tools.
4. `prompts/convertigo_quickstart.md`
   - The only exposed prompt still teaches the obsolete workflow.
5. `tests/prompt*.txt`
   - All tracked prompt scenarios still assume the removed tool family.

## Stable or reusable material

- `resources/convertigo_context_api.md`
  - Still valid. It documents runtime guardrails rather than obsolete MCP flow.
- `TOOLS.md`
  - Largely aligned with the live contract and useful as a written companion to `tools/list`.
- `resources/convertigo_transaction_quickstart.md`
  - HTTP advice is still useful, but the MCP workflow must be rewritten around tree-based authoring.
- `resources/convertigo_json_quickref.md`
  - Step semantics remain useful, but navigation and authoring examples need live-tool replacements.

## Phase 1 rewrite order

1. Create one canonical start guide from the live contract and the built-in resources.
2. Replace the exposed prompt with a tree-first version that points to the canonical start guide.
3. Rewrite the sequence, transaction, and UI specialized guides.
4. Rebuild the prompt-based tests and their README against the live contract.
5. Refresh `resources_index.json` descriptions so `resources/list` becomes trustworthy.

## Phase 0 decision

- Treat older `children/create/properties-*` wording as obsolete in this repository.
- Treat tree-based authoring as canonical.
- Treat colleague repositories as pattern sources for roles, validation gates, and benchmark discipline only.
