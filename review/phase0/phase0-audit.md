# Phase 0 Audit

## Baseline facts

- Endpoint reviewed: `http://localhost:18080/convertigo/api/mcp`
- Reviewed live server version: `0.0.11`
- Stable repeated counts:
  - tools: `21`
  - resources: `12`
  - prompts: `7`
- Current canonical authoring model:
  - inspect with `databaseobject-tree-get`
  - mutate with `databaseobject-tree-apply`
  - group work with `batch-call`
  - validate with `requestable-execute`

## Main findings

1. The live contract, the served resources, the role-prompt catalog, and the tracked prompt probes are aligned on the tree-based authoring model.
2. The live `21`-tool catalog still exposes distinct titles, high-signal descriptions, and typed input help for the full reviewed surface.
3. The public guide system is now live through `resources/list` with explicit guide metadata and prompt cross-links.
4. The public prompt catalog is now role-based through `prompts/list` and `prompts/get`, with `7` prompts and machine-readable workflow metadata.
5. Mandatory live Codex CLI probes now pass for planner, HTTP, and frontend NGX; the critic prompt also completed a live review run against a real probe log.
6. The backend sanity run remained non-blocking and surfaced a real weakness: the role prompt stayed too exploratory on a sequence-building task and never reached a write.
7. Phase 0 remains closed on contract truth; the next work now belongs to report formalization, benchmark scoring, and prompt refinement based on live probe findings.

## Comment-quality rule

Database object comments feed the MCP auto-documentation surfaced by
`tools/list`, so comment quality is part of the API review.

Phase 0 rule:

- comments must be dense and useful
- comments must not restate obvious names or types
- comments must focus on accepted formats, restricted value sets, defaults, side effects, and non-obvious behavior

Reference:

- `review/phase0/tool-comment-style.md`

## Self-documentation audit

### Current catalog status

All `21` live tools now reach the Phase 0 target quality bar.

Why:

- intent is clear from the name
- title and description are useful
- visible input parameters are documented and typed where the caller makes decisions
- outputs are readable enough without opening extra guides

### Weakest tools

No specific weak tool remains on the reviewed live catalog.

Why:

- the main catalog now has distinct titles, documented inputs, and truthful structured outputs
- future review effort can move from contract cleanup to guide quality, benchmarks, and long-tail UX polish

## Phase 0.5 outcome

The core output-contract review is now complete for:

- `batch-call`
- `databaseobject-tree-apply`
- `databaseobject-tree-get`
- `log-view`
- `requestable-execute`
- `mobile-builder-open`

Validated results:

- core schemas in `tools/list` now match the live runtime payloads
- legacy `*Json` output fields are gone from the two mutation-heavy tools
- `databaseobject-tree-get` now exports `tree` and `forest`
- `databaseobject-tree-apply` accepts the `tree-get` node shape directly in dry-run round-trip validation
- the last `8` previously B-grade tools now expose typed booleans, integers, and enums in `tools/list`

## What belongs where

### Tool metadata

Keep in tool metadata when it can be understood at call time without narrative context:

- action intent
- required inputs
- default values
- enums and allowed modes
- output envelope meaning
- common aliases and compatibility notes
- guide hints in future metadata

### Canonical start guide

Keep in the future single starting guide:

- the live source-of-truth order
- the tree-first authoring model
- the minimal safe session flow:
  - inspect
  - describe
  - mutate
  - validate
- when to use RAG and when not to
- how to end with an MCP critique or review note

### Specialized guides

Move domain-specific workflows into specialized guides:

- backend sequences and SmartTypes
- HTTP transactions and schema learning
- frontend NGX authoring and builder validation
- marketplace and shared assets
- benchmarking and critic roles

### RAG fallback

Keep only long-tail knowledge in RAG:

- product features not yet encoded into tracked guides
- troubleshooting across older Convertigo behaviors
- niche runtime or connector issues

Do not use RAG by default for:

- tool names
- parameter syntax
- the main authoring workflow

## Deprecation and replacement decisions

| Obsolete term | Phase 0 decision | Replacement |
| --- | --- | --- |
| `databaseobject-children` | deprecated in docs and tests | `databaseobject-tree-get` |
| `databaseobject-create` | deprecated in docs and tests | `databaseobject-tree-apply` |
| `databaseobject-properties-get` | deprecated in docs and tests | `databaseobject-tree-get`, `palette-describe`, or `databaseobject-schema` |
| `databaseobject-properties-set` | deprecated in docs and tests | `databaseobject-tree-apply` |

## Minimal canonical onboarding surface for Phase 1

The next rewrite should start from a small, trustworthy surface:

1. `convertigo://capabilities`
2. `convertigo://recipes/quickstart`
3. a canonical start guide that replaces the current overlap
4. a prompt catalog that points to those assets without duplicating them

Everything else should become specialized or be temporarily de-emphasized until rewritten.

## Phase 0 outputs produced here

- live contract baseline
- normalized tool catalog
- mismatch matrix
- glossary
- colleague pattern ledger
- tool UX scorecard
- future metadata specification

## Phase 0 non-goals

- no live API changes
- no MCP sequence changes
- no YAML authoring changes
- no in-place guide rewrite yet
- no benchmark automation yet

## Phase 0 closure

Phase 0 is now closed on the reviewed live surface.

Closure reasons:

- the live contract is captured at `0.0.11`
- docs, guides, prompts, and tests no longer teach removed CRUD flows
- all `21` tools now meet the review scorecard target
- no open Phase 0 contract mismatch remains between the live MCP surface and the current onboarding material
- role prompts are now live and discoverable without re-opening the Phase 0 contract work
