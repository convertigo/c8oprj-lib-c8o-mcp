# Convertigo Vibe Start

Use convertigo-vibe-generalist and Convertigo_<tool-id>. Read a known URI directly with Convertigo_requestable-execute, requestable:"lib_ConvertigoMCP.mcp_resources_read", variables:{uri:"<URI>"}; text is at result.payload.result.contents[0].text. Never use variables.path or an HTTP URL. Compare guidance versions once. Choose one task route; skip catalog lists when it is known. Calls in one message run concurrently: order dependent writes in batch-call or successive messages. Check result.error and partial/skipped mutations before continuing. Pass objects/arrays, never serialized JSON. Never edit project descriptors or generated artifacts. Prove backend application data, visible UI and project-save; report missing proof. In Vibe code keep calls below one minute (builder timeoutSec<=45). Use isolated VIBE_HOME; replaceConfig only for intentional resets. Before deployment/export run mobile-builder-build; a green dev viewer alone is insufficient.

## Drawers
- `convertigo://guides/vibe/setup` — Setup, isolation and bootstrap.
- `convertigo://guides/vibe/calls` — Ordered calls, error results and headless execution.
- `convertigo://guides/vibe/starter-http` — Starter import and typed HTTP transport.
- `convertigo://guides/vibe/http-variables` — URL paths, transaction classes and StepVariables.
- `convertigo://guides/vibe/backend-proof` — Public input forwarding and backend proof.
- `convertigo://guides/vibe/payload-proof` — HTTP payload failures and UI entry gate.
- `convertigo://guides/vibe/locals` — Palette objects, locals and input bindings.
- `convertigo://guides/vibe/bindings` — SmartSource readback and iterator text.
- `convertigo://guides/vibe/actions` — Conditions, action completion and starter cleanup.
- `convertigo://guides/vibe/output-shaping` — Cleanup, output shaping and XPath repair.
- `convertigo://guides/vibe/result-state` — Result storage, SC values and visible state.
- `convertigo://guides/vibe/validation` — Visible records, isolation and final evidence.
- `convertigo://guides/vibe/diagnostics` — Diagnose bootstrap, backend and binding failures.
- `convertigo://guides/vibe/diagnostics-ui` — Diagnose public contract and visible UI failures.
