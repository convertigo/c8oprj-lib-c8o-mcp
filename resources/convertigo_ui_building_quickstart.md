# Convertigo UI Building Quickstart (CRUD + Rich Pages)

Use this guide when implementing or updating Convertigo UI pages through MCP tools.

## Scope and Inputs
- UI must support table and card views, filters, create, update, delete, and pagination.
- Use only available MCP tools.



## Styling Rules
- Use a global-first CSS strategy.
- Place CSS by default at app root (`<project>.Application.NgxApp`) in one `ngx.components.UIStyle` object named `AppStyle`.
- Do not use `ngx.components.UITheme` for global app styling.
- Do not generate one style object per page by default.
- Create page-level style only for truly page-specific needs that cannot be safely expressed globally.
- When a page-level style is created, include a comment explaining why it is page-specific.
- Prefer modern Ionic 8 patterns for spacing, density, table/card readability, and responsive behavior.
- Do not leave placeholder-only layout; every page must have visible, styled content structure.


## UX Rules
- show loading, empty, and error states
- keep labels human-friendly and consistent
- idempotent behavior: never duplicate existing pages/components
- if an object exists, update it instead of recreating it

## MCP-Only Implementation Pattern
1. Inspect target project/page tree with `project-list` and `databaseobject-children`.
2. Discover UI objects with `palette-list`, then fetch templates with `palette-describe`.
3. Build a full mutation plan (all creates, updates, moves, deletes) before any write call.
4. Execute mutations one by one using MCP tools (`databaseobject-create`/`databaseobject-properties-set`/move/rename/delete) from that plan.
5. Validate binding and payload with `requestable-execute`.
6. Persist using `project-save`.

## Palette Type Safety (Mandatory)
- Do not create Ionic/palette UI with raw `UIDynamicElement` + `tagName` only.
- Any `UIDynamicElement` representing an Ionic/palette widget must include valid palette `beanData`.
- Reject and auto-correct any component where `beanData` is empty for palette widgets.
- Source of truth for `beanData` must come from palette templates (`palette-describe`) or an existing valid palette-instantiated component.
- If proper palette metadata is unavailable, stop optional component creation rather than creating invalid placeholders.
- Do not use `ngx.components.UICustom` (Fragment) by default.
- Use Fragment only as a last resort when no palette/native component can express the required behavior.
- Before creating a Fragment, explicitly try palette-native options (`UIDynamicElement`, `UIElement`, directives, attributes, actions).
- If a Fragment is unavoidable, keep it minimal, isolate only the unsupported part, and document why no non-Fragment solution exists.

## Fast Execution Mode (Default for Large UI Work)
- Generate the full page/component plan first (structure + properties + bindings) before sending write calls.
- Compute that plan in one LLM planning round before any write call.
- Mandatory sequencing:
  - discovery phase: read-only calls only (`project-list`, `databaseobject-children`, `palette-list`, `palette-describe`, optional `databaseobject-properties-get`)
  - execution phase: write calls only, executed from the precomputed mutation plan
  - verification phase: read/execute checks, then save
- Do not interleave ad-hoc write calls during discovery.
- If execution fails mid-plan, stop, rebuild the remaining plan, then continue.
- Execution-time guardrail:
  - precompute full mutation DAG and dependency levels before execution
  - execute independent mutations in parallel batches by level (use the widest safe batch size)
  - keep strictly dependent mutations sequential
  - minimize commentary/log chatter during execution phase
  - do not switch back to discovery while executing; finish the planned DAG first
- Auto-correction when execution is too long:
  - if end-to-end execution time is high for mutation count (for example > 8s for <= 15 mutations), switch to aggressive mode on next run
  - aggressive mode:
    1. cache class templates from prior `palette-describe` results when class names are unchanged
    2. collapse verification to one lightweight final `databaseobject-children` pass
    3. use widest safe parallel batches for sibling creations/updates
    4. defer non-critical reads until after save
    5. skip `project-reload` unless explicitly requested or required for consistency checks
    6. for performance tests, build minimal representative UI structure (avoid optional sample data rows/components)
    7. enforce a mutation call budget per run; if exceeded, switch to minimal profile immediately
- Performance test profile (default for benchmark/repeated runs):
  - build only mandatory structure first (`Page` + `Header` + `Content`).
  - add optional widgets only if explicitly requested after baseline timing is acceptable.
  - keep verification to required type-safety checks only (`beanData` presence on dynamic palette widgets).
- Minimize round-trips:
  - perform discovery once up front
  - avoid per-object read-after-write checks during build
  - do one verification pass at the end
  - on transport/decode failures, enqueue failed mutations and retry from a residual queue without re-running discovery
- For all mutations, use `autoSave=false`; call `project-save` once after the full mutation set succeeds.
- Group writes by phase to reduce tool overhead:
  1. create containers/pages
  2. create child components
  3. apply properties/bindings
  4. final verification + save
- Use idempotent behavior:
  - if object exists, update it (do not recreate)
  - if object is missing, create it once
- Prefer a single final `databaseobject-children`/`databaseobject-properties-get` verification instead of many intermediate inspections.
- If transport is unstable or high-latency, continue with phased writes and only checkpoint after a logical block, not after each object.
