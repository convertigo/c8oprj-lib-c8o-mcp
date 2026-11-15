# Mandatory workflow

Read when: Mandatory workflow. Summary: `convertigo://guides/http-sequence`.
Previous: `convertigo://guides/http-sequence/overview`. Next: `convertigo://guides/http-sequence/mandatory-workflow-2`.

---

## Mandatory workflow

### Golden path
1. Start with a stable business sequence contract. For a new public sequence created through the MCP tree API, use the palette class `sequences.GenericSequence`; if the class is not available in the current target, run `palette-list` on the project before creating the node.
2. Create or inspect one `HttpConnector`.
3. Set connector properties coherently:
   - `server` as the host only, for example `api.example.com`
   - `https` and `port` aligned with the real endpoint, for example `https=true` and `port=443`
   - optional `baseDir` only for a shared path prefix
   - do not set a synthetic `url` property; current Convertigo `HttpConnector` trees skip it because the connector stores host, scheme, port, and base directory separately
4. Add one transaction of the right type:
   - JSON HTTP transaction for JSON APIs
   - XML HTTP transaction for XML payloads
   - Download HTTP transaction for binary downloads
   - generic HTTP transaction only when payload type is not modeled by the dedicated ones
   - choose the type on creation; if the wrong transaction class was already created, delete it with `databaseobject-delete` and recreate it. `databaseobject-tree-apply` cannot turn an existing `HttpTransaction` into a `JsonHttpTransaction`.
5. Set transaction `subDir` separately from connector base URL.
6. Keep `httpInfo=true` during setup so transport behavior stays visible.
7. Execute the transaction directly.
8. Capture schema when downstream mapping or source pickers need it.
9. In the business sequence, call the HTTP transaction through a `TransactionStep`.
10. Map transaction output into the business sequence contract.
11. Validate the business sequence, not just the raw transaction.
12. Treat `status:"ok"` as only technical liveness. The business sequence proof is valid only when the payload contains the expected application data and contract fields.
13. In autonomous runs, reject providers that require missing credentials, demo usernames, exhausted quotas, or manual account setup unless the user supplied those credentials. A `401`, `403`, quota-limit body, or credential-required message is a live external-service proof failure, not a successful HTTP proof.
14. Choose a provider that satisfies the requested data contract. If the feature is about searchable records, the endpoint must return records with useful fields for that requested contract. Generic article search, URL suggestions, autocomplete labels, documentation pages, or provider help payloads are not a valid substitute unless the user explicitly asked for those artifacts.
15. Before any UI mutation, prove that the business sequence itself exposes the application contract the UI will bind to. For list/search pages, this usually means a top-level or clearly named object with `items`, `total`, `query`, `error`, or equivalent fields. A business sequence that only leaks `TransactionStep.output=true`, transport metadata, or a raw connector subtree is still a diagnostic business sequence, not a UI contract.

### Business business sequence with `business-sequence-create`
When the HTTP data feeds an application page or business rule, let `business-sequence-create` build the business sequence instead of shaping it by hand: it keeps the session user check, roles, perimeter, the `js/app.js` logic and the `{success, data, errors, meta}` contract of the other business sequences.
1. Build and prove the connector and the transaction as below, with `httpInfo=true`: the generator refuses an HTTP transaction without it, because a 404 or a lost connection then returns an ordinary document.
2. Name it in a read or a write: `{"name":"todos","transaction":"<connector>.<transaction>","vars":{"userId":"me.id"}}`. The transaction variables take `vars` or the business sequence input of the same name (a write: the fields of each row of `writes.<name>`).
3. In `logic`, `ctx.reads.todos` is the JSON body: a JSON array or object comes unwrapped, `HttpInfo` and `attr` are removed; `path:"items"` keeps one part of it.
