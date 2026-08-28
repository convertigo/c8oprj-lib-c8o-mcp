# Convertigo MCP Maintainer Brief

> Refreshed by `_refreshMaintainerDocs` from the live MCP catalog on `2026-03-16`. Live facts come from `mcp_initialize`, `mcp_tools_list`, `mcp_resources_list`, and `mcp_prompts_list`.

## Purpose

Maintain the `ConvertigoMCP` project as the tool and onboarding layer for AI-driven Convertigo development.

This file is for maintainers working on the MCP itself, not for end users of the tools.

## Current State

- Public MCP endpoint: `http://localhost:18080/convertigo/api/mcp`
- Current protocol: `2025-06-18`
- Current server name: `convertigo-mcp`
- Current server title: `Convertigo MCP Server`
- Current live version at last refresh: `0.0.17`
- Current public catalog at last live verification on `2026-03-16`:
  - `29` tools
  - `25` resources
  - `9` prompts

## Product Posture

- The recommended public path is mono-agent MCP for standard SQL CRUD + starter NGX UI work.
- The current recommended prompt/resource pair is:
  - `convertigo-crud-fastpath`
  - `convertigo://resources/convertigo-crud-fastpath`
- Planner, critic, maintainer, benchmark, and feedback-triage flows remain available, but they are internal lab surfaces during the mono-agent recovery cycle.

Do not trust this file over the live server. Verify with:

1. `initialize`
2. `tools/list`
3. `resources/list`
4. `prompts/list`

## Source Of Truth Order

When documentation, prompts, and runtime disagree, use this order:

1. live MCP signature and behavior
2. repository implementation and exported schemas
3. repository docs, prompts, and tests
4. companion experiments in other repositories

The review artifacts under `review/` follow this rule.

## Canonical MCP Model

Convertigo MCP remains tree-first at the primitive level, with one supported deterministic fast path layered on top for standard SQL CRUD + starter NGX UI delivery.

- Inspect with `databaseobject-tree-get`
- Mutate with `databaseobject-tree-apply`
- Group operations with `batch-call`
- When host reveal mode is enabled, pass top-level `reveal:true` to `batch-call`; optimized batches reveal the final touched object after their deferred Studio refresh.
- Validate behavior with `requestable-execute`
- Persist with `project-save`

For standard SQL CRUD + starter NGX UI work on a new UI project, the recommended public rail is:

1. `marketplace-import`
2. `mobile-builder-open`
3. `upsert-crud`
4. backend `crud-proof`
5. `upsert-ngx-crud-kit stage=bootstrap`
6. `mobile-builder-open`
7. `upsert-ngx-crud-kit stage=final`
8. final `crud-proof(viewerUrl)`
9. `project-save`

Do not present planner/specialist routing, benchmark flows, or manual YAML editing as the default path for that scope.

## Maintainer Rules

- Prefer MCP-native edits when changing MCP-managed objects.
- Convertigo project descriptors are MCP-owned. Never read or hand-edit `c8oProject.yaml`, `_c8oProject/**/*.yaml`, or `project.xml` as an authoring fallback. If the required MCP operation still fails after one targeted retry, stop and report the blocker without mutating project files.
- Keep tool names, titles, descriptions, and schemas aligned with the live behavior.
- Keep autodoc high-signal:
  - no boilerplate
  - no obvious restatement of parameter names
  - include only accepted formats, defaults, enums, side effects, and constraints that help the caller act correctly
- Keep public output fields in `lowerCamelCase`.
- Prefer typed envelopes with open payloads for dynamic inner objects.
- Treat RAG as slow fallback knowledge, not as the default onboarding path.

## Important Contract Decisions

- `databaseobject-tree-get` and `databaseobject-tree-apply` are the canonical authoring pair.
- The tree returned by `databaseobject-tree-get` must stay reusable by `databaseobject-tree-apply` without ad hoc translation.
- `requestable-execute` success payloads should expose `result` and optional `logs`. Failures must surface through the MCP error envelope.
- `rag-query` must not expose `stream`; backend calls must always force `stream=false`.
- Built-in resources such as `convertigo://capabilities` and `convertigo://recipes/quickstart` are part of the onboarding surface and must stay aligned with the live contract.
- `TOOLS.md` is generated from the live MCP catalog and is not a hand-maintained contract file.

## Files That Matter Most

- `_c8oProject/sequences/mcp_endpoint.yaml`
  - JSON-RPC entry point and response shaping
- `_c8oProject/sequences/internal_list_tools_info.yaml`
  - tool discovery for `tools/list`
- `_c8oProject/sequences/internal_json_schema.yaml`
  - schema generation
- `_c8oProject/sequences/tools_*.yaml`
  - public tool implementations
- `js/schema_overrides.js`
  - input/output schema overrides
- `js/tools_batch_call.js`
- `js/tools_databaseobject_tree_apply.js`
- `review/`
  - contract snapshots, mismatch matrix, scorecards, roadmap

## Documentation Policy

- English only.
- The live MCP catalog is the primary contract surface.
- `TOOLS.md` is a short generated human companion, not the source of truth.
- Public onboarding should bias toward the mono-agent CRUD fast path when it matches the task.
- `project.md` is generated output and may lag or include internal details; do not use it as the authoritative contract for prompts or guides.
- Runtime field feedback files are build artifacts under `feedback/inbox/` and must not be committed.
- Raw field feedback must be consolidated under `feedback/triage/` before it is used as maintainer input.
- Guide strategy is tracked in `REVIEW-ROADMAP.md`.

## Validation Checklist

After changing the MCP:

1. Check `initialize`
   - protocol version, server info, capabilities
2. Check `tools/list`
   - titles and descriptions are non-empty
   - input/output schemas match runtime behavior
3. Check core tools with live calls
   - `batch-call`
   - `databaseobject-tree-get`
   - `databaseobject-tree-apply`
   - `log-view`
   - `requestable-execute`
   - `mobile-builder-open` when safe
4. Check error routing
   - invalid tool input should become MCP `error`
   - tool-specific partial/validation states should stay in structured payloads when that is the chosen contract
5. Refresh the generated maintainer docs and any review artifacts when the contract changes.
