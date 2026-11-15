# Starter import and typed HTTP transport

Read when: Starter import and typed HTTP transport. Summary: `convertigo://guides/vibe`.
Previous: `convertigo://guides/vibe/calls`. Next: `convertigo://guides/vibe/http-variables`.

---

## Fresh starter app rail
- For a fresh NGX app, after reading `convertigo://guides/starter`, import `template_ngxBuilderIonic` with `Convertigo_marketplace-import` and the exact requested project name.
- Do not guess marketplace names such as `NGXAppStarter`.
- Open the mobile builder early with `Convertigo_mobile-builder-open wait=false`, continue other backend or UI work while it starts, then call `Convertigo_mobile-builder-open stateOnly=true wait=true` before live proof. Attach Playwright or browser-control MCP only when that result reports `browserControlReady:true`; if `browserControlTargetUrl` is `about:blank`, keep polling because the Studio loader is still building. If those MCP browser tools are unavailable, disabled, stale, or attached elsewhere, report the managed Playwright MCP configuration problem instead of using Node scripts, raw CDP, or a separate browser.
- For any app that consumes an HTTP web service, read `convertigo://guides/http-sequence` before creating the connector, transaction, or business sequence. This applies to HTTP-backed data flows regardless of provider, dataset, or requested contract.
- The chosen HTTP provider must satisfy the requested data contract. If the app is about searchable records, the endpoint must return records with useful fields for that contract, not only generic article titles, URLs, autocomplete suggestions, or documentation text. If the first provider fails because of malformed paths, DNS, TLS, missing credentials, quota, or provider errors, either fix the connector settings or choose another public endpoint that still returns records for the requested contract. Otherwise keep the HTTP rail and mark the live proof incomplete.
- For data-backed pages, including pages backed by HTTP web services, read `convertigo://guides/data-page` before the first UI mutation.
- Mutate the actual visible entry page first. On the starter this is usually `Application.NgxApp.pg:Page`, especially `Page.Content`.
- Do not create only a secondary feature page while the visible entry page still shows the starter body.
- In Vibe, do not split dependent mutations across the calls of one `Convertigo_batch-call`, and build the first UI event/action chain with direct `Convertigo_databaseobject-tree-apply` calls, reading back each created event/action. Independent lots go through one `batch-call` with `callsFile` (see Fewer calls, same method). Never hand-write a large nested tree in a tool argument: generate it with a script into the `callsFile` JSON, or create one object at a time as below. If a later independent batch is truly necessary, each nested `calls[].tool` value must be the unprefixed MCP tool id such as `databaseobject-tree-apply`, not the Vibe-exposed name `Convertigo_databaseobject-tree-apply`. If that distinction is uncertain, do not batch.
- Use `Convertigo_databaseobject-delete` for actual object deletion. `databaseobject-tree-apply` with `mode:"replace"` and `{}` does not delete the target object; it only patches nothing and can leave empty `REMOVED` shells behind. After a delete, read back the parent and require that the deleted QName is absent.
- For HTTP connectors, use `server`, `https`, `port`, and optional `baseDir`; do not set skipped or guessed properties such as `url`, `timeout`, `parameters`, or `httpParameters` unless readback has already shown they exist on that exact object type.
- Compose HTTP URLs from `server` + optional `baseDir` + transaction `subDir`; do not invent `/api` or change provider paths after a runtime failure unless a readback or live proof supports it. If readback or runtime logs show a malformed path such as a doubled slash between base directory and transaction path, fix `baseDir`/`subDir` and rerun the transaction proof.
