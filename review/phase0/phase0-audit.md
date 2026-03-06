# Phase 0 Audit

## Baseline facts

- Endpoint reviewed: `http://localhost:18080/convertigo/api/mcp`
- Reviewed live server version: `0.0.8`
- Stable repeated counts:
  - tools: `21`
  - resources: `9`
  - prompts: `1`
- Current canonical authoring model:
  - inspect with `databaseobject-tree-get`
  - mutate with `databaseobject-tree-apply`
  - group work with `batch-call`
  - validate with `requestable-execute`

## Main findings

1. The live contract has already moved to tree-based authoring, but most file-based guides and prompt tests still teach the removed create and properties workflow.
2. The built-in resources are currently more aligned with the live contract than the file-based guides.
3. The catalog itself is usable, but several important tools remain under-documented at the tool-metadata level.
3. The catalog titles, descriptions, and visible input parameter help have now been rewritten across the live `21`-tool surface.
4. The current prompt and benchmark corpus is no longer a trustworthy measure of the live MCP experience.
5. Phase 0.5 has cleaned the core output contract and the remaining non-core false positives have been closed in the reviewed catalog.

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

### Stronger tools

- `batch-call`
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `requestable-execute`
- `project-js-get`
- `project-js-set`
- `databaseobject-search`
- `project-list`
- `palette-describe`
- `marketplace-list`

Why:

- intent is clear from the name
- title and description are useful
- visible input parameters are documented where the caller makes decisions
- outputs are readable enough without opening extra guides, except for the remaining JSON-string report envelopes on a few mutation-heavy tools

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
3. a rewritten canonical start guide
4. a rewritten prompt that points to those three assets

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
