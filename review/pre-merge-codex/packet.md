# Pre-merge Review for `codex`

## Baseline

- Review date: `2026-03-16`
- Live MCP baseline:
  - server version: `0.0.17`
  - tools: `29`
  - resources: `25`
  - prompts: `9`
- Branch reviewed: `codex/crm-visual-live-state`
- Review posture:
  - MCP live contract is the public source of truth
  - repo cleanup remains audit-only in this cycle
  - JS architecture review goes to redesign target level, not only style cleanup

## Merge decision

`GO` with explicit technical debt.

The branch is now mergeable into `codex` after the fixes already present in this worktree:
- `crud-status` no longer crashes on direct public calls
- built-in MCP resources match the current live rail
- `AGENT.md` and `TOOLS.md` are generated from the live MCP catalog
- the public CRUD fast-path resource now mirrors the fresh-session discovery rule

The remaining risk is architectural and documentary, not a broken public contract.

## Merge blockers

None at the time of this refresh.

Previously blocking issues already fixed in this worktree:
- `crud-status` missing `entryPage` request variable
- stale built-in resources in `js/resources.js`

## Must-fix before merge

None required to keep the public contract coherent.

The branch is still carrying accepted debt that should be called out in the merge note:
- `js/tools_crud.js` remains a very large orchestration monolith
- repo surface qualification is documented in review artifacts, but not yet enforced by structural cleanup

## Safe follow-ups after merge

### 1. Split the main JS monoliths

- Target files to split first:
  - `js/tools_crud.js`
  - `js/databaseobject.js`
  - `js/schema_overrides.js`
  - `js/tools_mobile_builder_open.js`

### 2. Remove or reclassify ambiguous repo surfaces

- Strong delete/archive candidates:
  - `readme.ftl` if generated README export is no longer part of the workflow
- `project.md` is now de-emphasized in `readme.md`, but still remains a generated parallel surface that should not be mistaken for canonical documentation.
- Historical Convertigo surfaces such as `index.html`, `css/custom.css`, `js/custom.js`, `project.md`, and `readme.ftl` are retained for compatibility unless the broader project policy changes.

### 3. Reduce documentation duplication further

- Keep public truth in:
  - tool descriptions from `tools/list`
  - `resources/list`
  - `prompts/list`
  - short `readme.md`
- Keep maintainer truth in:
  - generated `AGENT.md`
  - targeted review packets under `review/`
- Keep `TOOLS.md` as a short generated companion only; do not let manual detail creep back into it.

## Archive / keep / retire matrix

See:

- `review/pre-merge-codex/repo-inventory-matrix.json`
- `review/pre-merge-codex/js-architecture-matrix.json`
- `review/pre-merge-codex/docs-catalog-mismatch.json`

High-level decisions:

- `public product`
  - `_c8oProject/`
  - `js/`
  - `resources/`
  - `prompts/`
  - `readme.md`
- `maintainer`
  - `AGENT.md`
  - `TOOLS.md`
  - `knowledge/`
- `internal lab`
  - `tests/`
  - `review/`
- `historical/generated or delete-candidate`
  - `project.md`
  - `readme.ftl`
  - `index.html`
  - `css/`
  - `js/custom.js`

## Recommended redesign target

### JS boundaries

- Convertigo / DatabaseObject primitives:
  - object resolution
  - property coercion
  - XMLizable / SmartType handling
  - Studio refresh helpers
  - save/reload/version bump
- Batch orchestration:
  - operation planning
  - deferred mutation finalization
  - save / refresh / builder finalization
- CRUD domain:
  - spec normalization and defaults
  - seed generation
  - backend SQL/requestable scaffolding
  - UI shell generation
  - proof/status/viewer checks
- Catalog metadata:
  - shared loader for `resources/` and `prompts/`
  - tool description/schema assembly

### Files that should stop growing now

- `js/tools_crud.js`
- `js/databaseobject.js`
- `js/schema_overrides.js`
- `js/util.js` for domain-specific helpers

## Acceptance status

Already satisfied in the current worktree:
- `crud-status` works through direct MCP `tools/call`
- built-in resources match the current public discovery and CRUD rail
- `AGENT.md` and `TOOLS.md` no longer drift on live counts or on the canonical CRUD order
- the repository has an explicit keep/archive/retire classification for ambiguous top-level surfaces
- the redesign target for the JS monoliths is explicit enough to implement without a new architecture round

Still pending as follow-up work, not as merge blockers:
- actual module extraction from the JS monoliths
- structural repo cleanup of lab/historical surfaces
