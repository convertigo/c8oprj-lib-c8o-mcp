# Convertigo MCP Maintainer Brief

> Refreshed by `_refreshMaintainerDocs` from the live MCP catalog on `2026-03-16`. Live facts come from `mcp_initialize`, `mcp_tools_list`, `mcp_resources_list`, and `mcp_prompts_list`.

## Purpose

Maintain the `lib_ConvertigoMCP` project as the tool and onboarding layer for AI-driven Convertigo development.

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

## Who owns the managed MCP url (contract with lib_ConvertigoAgentBridge)

`lib_ConvertigoAgentBridge` writes the managed Vibe `config.toml` and then calls
`_setupVibe` (through `installAgentSkills`), so this project always runs last on
that file. Both used to write the `url` of the same `[[mcp_servers]]` entry and
fought over it: the Bridge wrote an enriched url and `_setupVibe` rewrote it to
its own `?jsonOnly=true` form.

**The Bridge owns that url.** It marks the urls it owns with `from_bridge=true`:

```
http://<host>/convertigo/api/mcp?jsonOnly=false&from_bridge=true&descriptorVersion=<guidance>&toolsRevision=<hash>
```

- When `_setupVibe`, `_setupCodex` or `_setupClaude` finds an existing MCP server
  entry whose url carries `from_bridge=true`, it leaves that url untouched. It
  still repairs everything else it owns in the entry: `tool_timeout_sec` /
  `startup_timeout_sec`, `[mcp_servers.auth]`, the
  `X-Convertigo-Guidance-Version` header, the `[tools.*]` permissions.
- Without the marker, behaviour is unchanged: the url is rewritten, so a stale or
  hand-written entry is still repaired and an older Bridge keeps working.
- `replaceConfig=true` still rebuilds the whole file from scratch — that is an
  explicit "reset this home" request, not a repair, and the marker does not
  apply to it. The Bridge always calls with `replaceConfig=false`.
- The marker is inert server side: `mcp_endpoint` reads `request`, `jsonOnly`
  and, as a header fallback, `descriptorVersion`; the `/api/mcp` URL mapper maps
  `request` and `jsonOnly` only and ignores unknown query parameters.
- Implemented by `isBridgeOwnedMcpUrl` in `js/setup_vibe.js` and
  `js/setup_codex.js`, and by the `keepUrl` check in `js/setup_claude.js`.
  Deliberately duplicated rather than shared through `js/setup_common.js`, which
  is a guidance fingerprint source (`js/guidance_version.js`): touching it would
  change `C8O.MCP_GUIDANCE_VERSION` for an internal refactor.
- Covered by `tests/scripts/validate_setup_vibe_config.js` (marker honoured, and
  the no-marker path still repairs).

## X-Convertigo-No-Log in the client configurations

Since Convertigo 8.4.6 the engine `MdcFilter` covers every URL, `/api/mcp`
included: a request carrying `X-Convertigo-No-Log: true` (or `?__nolog=true`)
writes no engine log at all. Below 8.4.6 the header only mutes the logs of the
sequence steps (`js/mcp_endpoint_router.js`). It mutes a whole client, tool
calls included, not one JSON-RPC method.

- `_setupCodex`, `_setupClaude` and `_setupVibe` write the header on the
  `convertigo` server (not on `convertigo-flow`), with the Bridge's rule
  (`C8O.util.mcpNoLogEnabled`): the `mcpNoLog` variable, else the global symbol
  `agentbridge.mcp.nolog`, else `true`. `mcpNoLog=false` removes the header.
- A Bridge-owned entry (url with `from_bridge=true`) keeps the header the Bridge
  chose: the Bridge has its own `mcpNoLog` option and calls the setups after
  writing its configuration.

## showExperimental on the MCP endpoint

`palette-list`, `palette-describe` and `databaseobject-schema` hide the
experimental features of the engine (JSON native steps, JSON native properties
of a sequence) while the engine switch `ExperimentalFeatures` is off. A client
whose endpoint URL has `?showExperimental=true` (for example
`http://localhost:18080/convertigo/api/mcp?showExperimental=true`), or that
sends the header `X-Convertigo-Show-Experimental: true`, sees them on every
request, whatever the switch.

- `js/mcp_endpoint_router.js` reads the URL or the header and passes the hidden
  variable `_showExperimental` to those three tools and to `batch-call`, which
  passes it on to its calls of those tools. It is not in their input schemas,
  and a value passed by the model is dropped.
- `C8O.dbo.isExperimentalShown` (`js/databaseobject.js`) returns true when
  `_showExperimental` is `true`. The palette property counts are cached apart
  (`#experimental` key suffix).
- Covered by `tests/scripts/validate_experimental_features.cjs`.

## Workflow tools (lib_WorkflowEngine)

`workflow-list`, `workflow-get`, `workflow-draft-create`, `workflow-draft-put`, `workflow-validate`,
`workflow-simulate`, `workflow-publish`, `workflow-requests` and `workflow-catalog` (`js/workflow_tools.js`,
`tools_workflow_*.yaml`) call the sequences of `lib_WorkflowEngine` and nothing else; the guide is
`convertigo://resources/convertigo-workflow` (prompt `convertigo-workflow`).

- Identity: each tool call validates the bearer of its HTTP request again (`C8O.mcpAuth.authenticateRequest`), then
  runs the engine sequences through `InternalRequester` on an `InternalHttpServletRequest` whose session is its own
  and signed in as the token user (`SessionAttribute.authenticatedUser`; `c8o:admin` for a token of the
  administration console). The session carries no role: the engine resolves them as for any user (roles sequence,
  global symbols `lib_WorkflowEngine.designers` / `admins`). The tools never call `workflowDevLogin`,
  `workflowSessionSetRoles` or the `*As` sequences, never touch the MCP client session, and sign the internal session
  out at the end. A No Code token is refused (the router already keeps it to the no-code tools).
- The engine answers typed XML (`jsonToXml` with data types), read back with `XmlToJson(..., useType, docChildNodes)`:
  definitions round-trip exactly (checked live on the templates and on keys with spaces, unicode, empty objects).
- Every answer is `{status, actor, ...}`; engine refusals keep their code (`forbidden`, `conflict`, `invalid`,
  `not_found`) with `error.hint` naming the token user and where the engine reads its roles. `workflow-publish`
  publishes nothing without `confirm:true` and needs the `draftRevision` the user checked.
- The tools stay listed when `lib_WorkflowEngine` is not loaded and answer `workflow_engine_missing`: the libraries
  are imported during a conversation, and a tool hidden at the start of a session would not appear afterwards.
- Covered by `tests/scripts/validate_workflow_tools.cjs`, which runs the real engine of lib_WorkflowEngine
  (`WORKFLOW_ENGINE_ROOT`) on its MemoryStore behind a fake `InternalRequester` that only accepts the variables each
  engine sequence declares, and live by `tests/preflight/workflow_live.py`.

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
