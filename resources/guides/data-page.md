# Convertigo NGX Data Page Recipe

Prove the backend application contract before UI work; metadata/status alone is insufficient. Build the visible entry page with palette objects: input bound to local searchQuery in SC mode, a visible button label, CallSequenceAction, stable locals results/loading/error/empty, and a ForEach with matching directiveItemName. Use requestable paths Project.Sequence and preserve variable names end to end. Chain dependent actions as children; siblings run in parallel. Read a valid SmartSource rather than guessing its internal JSON. No scriptContent backend call, DOM scrape or UICustom page body. Read back the structural gate, prove normal/empty/error/retry behavior in the viewer, then project-save. Never patch generated artifacts. Before deployment/export run mobile-builder-build; a green dev viewer alone is insufficient.

## Drawers
- `convertigo://guides/data-page/orientation` — When to use the data-page recipe.
- `convertigo://guides/data-page/golden-path` — Golden path and palette-first state.
- `convertigo://guides/data-page/input-binding` — Input Local SmartSource and binding examples.
- `convertigo://guides/data-page/result-binding` — Result storage and source binding examples.
- `convertigo://guides/data-page/action-chain` — Action chain, custom action and output rules.
- `convertigo://guides/data-page/proof-gate` — Contract proof before the structural gate.
- `convertigo://guides/data-page/structure-gate` — Mandatory palette-modeled data-page gate.
- `convertigo://guides/data-page/search-contract` — Search input, public variables and shaping.
- `convertigo://guides/data-page/search-input` — Search input binding readback and repairs.
- `convertigo://guides/data-page/search-call` — CallSequenceAction and request variables.
- `convertigo://guides/data-page/search-results` — Results, loading, error and empty state.
- `convertigo://guides/data-page/search-iterator` — ForEach sources and row field text.
- `convertigo://guides/data-page/search-ui` — Input state and visible search behavior.
- `convertigo://guides/data-page/search-repair` — Search readback and runtime repair.
- `convertigo://guides/data-page/state-model` — Visible shell, templates and state model.
- `convertigo://guides/data-page/events` — Binding modes and event rules.
- `convertigo://guides/data-page/failures` — Anti-patterns and common failure modes.
- `convertigo://guides/data-page/proof` — Runtime evidence and completion checks.
