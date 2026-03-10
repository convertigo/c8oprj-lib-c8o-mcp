# Convertigo MCP Maintainer Brief

## Purpose

Maintain the `ConvertigoMCP` project as the tool and onboarding layer for
AI-driven Convertigo development.

This file is for maintainers working on the MCP itself, not for end users of
the tools.

## Current State

- Public MCP endpoint: `http://localhost:18080/convertigo/api/mcp`
- Current protocol: `2025-06-18`
- Current server name: `convertigo-mcp`
- Current live version at last review: `0.0.15`
- Current public catalog:
  - `24` tools by default
  - `25` tools when `${mcp.report.mode=off}` resolves to `suggest` or `benchmark`
  - `12` resources
  - `8` prompts

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

Convertigo MCP is now tree-first.

- Inspect with `databaseobject-tree-get`
- Mutate with `databaseobject-tree-apply`
- Group operations with `batch-call`
- Validate behavior with `requestable-execute`
- Persist with `project-save`

Do not reintroduce the older CRUD-style authoring flow in guides or prompts.

## Maintainer Rules

- Prefer MCP-native edits when changing MCP-managed objects.
- Do not hand-edit `_c8oProject/**/*.yaml` unless there is no safe MCP or Studio
  path yet, and call that gap out explicitly.
- Keep tool names, titles, descriptions, and schemas aligned with the live
  behavior.
- Keep autodoc high-signal:
  - no boilerplate
  - no obvious restatement of parameter names
  - include only accepted formats, defaults, enums, side effects, and
    constraints that help the caller act correctly
- Keep public output fields in `lowerCamelCase`.
- Prefer typed envelopes with open payloads for dynamic inner objects.
- Treat RAG as slow fallback knowledge, not as the default onboarding path.

## Important Contract Decisions

- `databaseobject-tree-get` and `databaseobject-tree-apply` are the canonical
  authoring pair.
- The tree returned by `databaseobject-tree-get` must stay reusable by
  `databaseobject-tree-apply` without ad hoc translation.
- `requestable-execute` success payloads should expose `result` and optional
  `logs`. Failures must surface through the MCP error envelope.
- `rag-query` must not expose `stream`; backend calls must always force
  `stream=false`.
- Field feedback is controlled at runtime by the Convertigo global symbol
  `${mcp.report.mode=off}`.
  - `off` hides the feedback tool and prompt hint entirely
  - `suggest` exposes optional field feedback
  - `benchmark` exposes the same tool with stronger benchmark wording
- Built-in resources such as `convertigo://capabilities` and
  `convertigo://recipes/quickstart` are part of the onboarding surface and must
  stay aligned with the live contract.
- Phase 1 guide resources are versioned and exposed through `resources/list`
  with metadata such as `guideId`, `revision`, `scopeTags`, `prerequisites`,
  `recommendedTools`, `guidanceLevel`, and `fallbackToRag`.
- The retired Phase 0 guide URIs must not be reintroduced into the public MCP
  resource catalog.

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
- `TOOLS.md` is a short human companion, not the source of truth.
- `project.md` is generated output and may lag or include internal details; do
  not use it as the authoritative contract for prompts or guides.
- Runtime field feedback files are build artifacts under `feedback/inbox/` and
  must not be committed.
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
   - tool-specific partial/validation states should stay in structured payloads
     when that is the chosen contract
5. Refresh review artifacts when the contract changes
   - `review/live-contract/`
   - `review/phase0/`
   - `review/mismatch/summary.md`

## Current Phase Status

- Preparation Phase: done
- Phase 0: done
- Phase 0.5: done
- Phase 1: done
- Phase 2: done
- Phase 3: done
- Phase 4: done
- Phase 5 scaffolding: done
- Current follow-up: optional field feedback channel and further live benchmark expansion

See `REVIEW-ROADMAP.md` for the working plan.

## Practical Reminder

If a change is awkward through MCP, do not silently fall back to manual YAML and
declare success. Treat that friction as product feedback:

- either improve the MCP workflow
- or record the missing primitive / missing UX in the roadmap or review notes

That feedback loop is part of the product, not just an implementation detail.
