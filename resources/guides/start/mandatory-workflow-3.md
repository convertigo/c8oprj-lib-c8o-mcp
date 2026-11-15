# Viewer URLs, call skeletons and first-write checks

Read when: Viewer URLs, call skeletons and first-write checks. Summary: `convertigo://guides/start`.
Previous: `convertigo://guides/start/mandatory-workflow-2`. Next: `convertigo://guides/start/mandatory-workflow-4`.

---

23. In dev, the live mobile viewer is served from the viewer root or `viewerHomeUrl`. For UI tasks, the full loop is async open with `mobile-builder-open(wait=false)`, useful inspection or mutation while the builder warms up, a waited/state-only poll, then browser smoke only when `browserControlReady:true`. If `browserControlTargetUrl` is `about:blank`, the Studio loader is still building and you must keep polling. Use the configured Playwright/browser-control MCP for the ready endpoint; before browser smoke, inspect the current browser target and confirm it is the returned viewer, not `about:blank` or another URL. If it is unavailable, disabled, stale, or attached elsewhere, report the configuration problem instead of using Node scripts, raw CDP, or a separate browser. When `browserDebugPortRequested` is 0 the client has no managed browser: follow `browserControlHint` and navigate your own browser tool to `viewerHomeUrl`. Reserve `.../DisplayObjects/mobile/home` for production builds.
24. Never patch `_private/ionic`, `DisplayObjects`, `dist`, or other generated artifacts. Treat them as diagnostics only; correct the Convertigo source objects or the MCP generator instead.
25. Validate behavior with `requestable-execute` or `crud-proof`. Use `log-view` only when execution feedback is not enough.
26. Save with `project-save`.
27. Read a specialized handbook only when the recipe leaves open questions.

### Minimal call skeletons

```json
{"name":"project-list","arguments":{"limit":10}}
```

```json
{"name":"databaseobject-tree-get","arguments":{"target":"<qname>","childrenDepth":1,"properties":"none"}}
```

```json
{"name":"palette-list","arguments":{"target":"<parent qname>"}}
```

```json
{"name":"databaseobject-tree-apply","arguments":{"target":"<qname>","at":"self","mode":"merge","tree":{"properties":{}}}}
```

Property values belong inside that object:

```json
{"name":"databaseobject-tree-apply","arguments":{"target":"<qname>","at":"self","mode":"merge","tree":{"properties":{"comment":"Updated by MCP","isEnabled":"true"}}}}
```

Do not send `tree.properties` as an array of `{name,value}` objects. That legacy-looking shape can be partially applied while still returning parser errors, which makes later validation unreliable.

```json
{"name":"requestable-execute","arguments":{"requestable":"<project>[.<connector>].<requestable>","variables":{}}}
```

### Before first write checklist
Lock these decisions before the first mutation:
- which recipe matches the task and why
- exact target QName and case
- patch existing node or create new node
- correct parent placement: `self`, `inside`, `before`, or `after`
- correct palette entry or canonical `className`
- expected response contract when the task changes runtime behavior
- for HTTP integrations, confirmed transport is modeled by `HttpConnector` plus a typed HTTP transaction before writing the business sequence
- for HTTP integrations, confirmed the business sequence will call the transaction through `TransactionStep` and will not contain `java.net.URL`, `fetch`, `XMLHttpRequest`, ad hoc HTTP clients, or equivalent transport code
- validation call to run immediately after the mutation
- whether the task requires only `project-save` or also `project-reload`
- whether the task truly needs rollback/reload proof; `project-reload` is not a freshness step for `requestable-execute`

### QName forms
- Tool inputs accept both the historical flat QName and the canonical prefixed QName.
- Public tool outputs use the canonical prefixed QName.
- Prefer copying the returned `qname` directly into follow-up tool calls.

### Guide escalation example
Correct escalation for a multi-track feature:
1. Start here and inspect the project.
2. Read `convertigo/platform-big-picture@1`.
3. Read `convertigo/engineering-workflow@1`.
4. Read `convertigo/contract-first-delivery@1` before any write call.
5. Read `convertigo/recipe-business-sequence-stub@1` to define the business sequence and stub.
