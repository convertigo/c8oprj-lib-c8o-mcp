# Convertigo MCP Usage Guide

This guide is intentionally concise to avoid overwhelming the agent. Follow the fast path below, then the key reminders.

## Strictly Follow (Short Version)
1) Run `databaseobject-children` on the parent (copy the exact QName).  
2) Run `palette-list` on that parent with a targeted filter (`Call`/`JSON`/`Request`, small `limit`). If `content` is empty, **do not paginate**: adjust the filter or go directly to `palette-describe`.  
3) Run `palette-describe` on `describeClassName` to get template + hints.  
4) Prepare the **full mutation plan** (create/set/move/rename/delete) before the first write call.  
5) Then execute mutations one by one, strictly from that plan (`databaseobject-create` with mandatory `related`, not `qname`).  
6) If transaction-related: run `requestable-execute ... recordSchema=true` before any SmartType wiring.  
7) In sequences: use CallTransaction/CallSequence with `output=false`, map through SmartType + JsonField/XMLCopy. No JS DOM (JS only for simple calculations). Return only final JSON.

## HTTP Endpoints
- MCP JSON-RPC: `http://localhost:18080/convertigo/api/mcp`
- Sequence invocation (manual): `http://localhost:18080/convertigo/projects/<project>/.json?__sequence=<name>&var=value`
- Always send `MCP-Protocol-Version: 2025-06-18` on the MCP endpoint.

## Tooling Conventions
- Prefer MCP tools (no YAML editing): create/delete/move/rename, properties-get/set, project-save/reload.
- Required execution mode:
  - Discovery phase: read-only tools only.
  - Mutation phase: apply the prepared plan, mutation by mutation.
  - Verification phase: final checks, then `project-save`.
- Performance (mandatory):
  - prepare the entire page/component plan in a single LLM planning round before the first write call.
  - prepare the complete plan with dependencies (DAG) before the first write call.
  - execute all independent mutations in parallel batches, using the maximum safe batch width.
  - keep only parent/child-dependent mutations sequential.
  - limit intermediate reads; one final verification is enough.
  - on transport/decode failures, replay only failed mutations from a residual retry queue (without re-running discovery).
- Auto-correction when execution is too slow:
  - detect a slow run relative to the mutation count.
  - on the next run, enable aggressive mode: more parallelism, fewer intermediate checks, reuse known templates.
  - reduce the plan to the minimum functional scope for the requested test (avoid optional objects).
  - do not run `project-reload` by default after `project-save` (unless explicitly requested).
  - define a call budget per run; if exceeded, switch automatically to a minimal profile.
  - minimal benchmark profile: `Page` + `Header` + `Content` only, then optional enrichment in a separate run.
- Palette:
  - `palette-list` returns essentials; immediately follow with `palette-describe` using `describeClassName`.
  - If `palette-list` is empty, do not paginate: change filter or use `palette-describe` if class is known.
- `databaseobject-children` navigation:
  - `depth` 1-5, filters applied after traversal, pagination via `limit`/`nextCursor`.
  - Forward `_meta.nextCursor` only when non-empty.
- `databaseobject-create`:
  - mandatory `related` (exact parent QName), `className` (short bean), `mode` (inside/before/after/lastChild), `properties` as JSON object (`{}` when none). Do not use `qname` here.
  - for Ionic/palette UI components (`UIDynamicElement`), never create with `tagName` only: valid `beanData` is mandatory.
  - if `beanData` is empty, treat the object as invalid and fix immediately (set from palette template or recreate).
  - do not use `ngx.components.UICustom` (Fragment) by default.
  - use Fragment only as a last resort, only when no palette combination (`UIDynamicElement`, `UIElement`, directives, attributes, actions) can achieve the result.
  - if Fragment is unavoidable, keep it minimal and document the technical reason.
- `databaseobject-properties-set`:
  - `properties` must be a JSON object (or a string representing one). Never use a `{name,value}` array.
- `databaseobject-properties-get`:
  - lightweight view by default; add `includeHints=true` for detailed hints.
- Sequences:
  - use CallTransaction/CallSequence with `output=false`, map via SmartType + JsonField/XMLCopy. No JS DOM; JS reserved for simple calculations. Return only final JSON.
  - Transactions: run `requestable-execute ... recordSchema=true` before wiring SmartTypes, then retest after mapping.
- Save: run `project-save` (or `autoSave=true`) after mutations.
- QNames: case-sensitive, without `.sq` suffix.

## Testing & Verification
- Start with `requestable-execute` (variables = key/value JSON string, never a query string).
- HTTP `curl .../.json` tests are optional, only if requested and `localhost:18080` is reachable.
- Useful engine log: `/Users/nicolas/dev/convertigo/runtime-ConvertigoStudio/.metadata/.plugins/com.twinsoft.convertigo.studio/logs/engine.log`.

## Tool: databaseobject-schema
Use `tools/call databaseobject-schema` for a lightweight sample (XML/JSON/JSONSchema).
- `qname` required; `type` = xml/json/jsonschema; `internal=true` for sourceDefinition view (input pickers).
- Outputs are already de-wrapped: XML root is the target element (no `<document>`), JSON root is payload (no `document/attr`).

### HTTP connector checklist
- `HttpConnector.url`: scheme + host, no trailing slash. Do not set `/` or leave empty.
- `HttpTransaction.subPath`: must start with `/`, final URL = url + subPath (avoid `//`).
- Use `JsonHttpTransaction` for JSON APIs; keep `httpInfo=true` during build.
- Never do custom HTTP in JS (URLConnection/HttpClient/fetch forbidden): use connectors/transactions.
- Test transaction alone with `requestable-execute {"requestable":"<project>.<connector>.<transaction>"}` (`httpInfo=true` if needed).
- After each URL/subPath change: run `requestable-execute ...` to validate target before wiring a sequence.
- Use `databaseobject-schema` to capture XPaths without guesswork.
- No global "continue on error": handle fallbacks in sequence (If/Then/Else or JIf) and return fallback JSON. `httpInfo=true` helps in debug.
- If `databaseobject-create` with `mode=after` fails (decode), create with `inside` then reorder via `databaseobject-move`.
- Transactions: `recordSchema=true` before wiring; use CallTransaction with `output=false`, map only what is needed.
