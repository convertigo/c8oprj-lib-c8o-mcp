# Mono-Agent CRUD Calibration

This note captures the example projects reviewed during the mono-agent recovery cycle. It is intentionally short and biased toward reusable patterns.

## Sources reviewed
- Loaded workspace projects through `project-list`
- `sampleKitchenSink`
- starter NGX templates (`mobilebuilder_tpl_*_ngx`)
- library-style UI projects such as `lib_ExtendedComponents_ui_ngx`

## Reusable backend patterns
- Keep the CRUD fast path deterministic: connector, transactions, public facade sequences, then proof.
- Prefer stable requestable names and proofable contracts over custom sequence choreography in the first pass.
- Treat project identity and QName resolution as first-order reliability concerns.

## Reusable UI patterns
- The real visible page follows the standard `Page -> Header + Content` structure.
- Use the actual entry page content subtree as the primary UI target.
- Shared components and app-level styles are the safest first-pass structure for reusable CRUD UI.
- `sampleKitchenSink` confirms that application-level style and page-level header/content structure are the stable NGX backbone.

## Anti-patterns to avoid
- Do not keep the default starter body as dominant content after the first visible pass.
- Do not start with broad palette exploration when deterministic CRUD tools already fit.
- Do not route standard CRUD through planner/specialist orchestration first.
- Do not rely on RAG for questions already answered by the starter structure, built-in resources, or live MCP tools.
