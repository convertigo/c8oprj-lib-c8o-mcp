# HTTP Backend

Read when: HTTP Backend. Summary: `convertigo://guides/http-app`.
Previous: `convertigo://guides/http-app/hard-rules-2`. Next: `convertigo://guides/http-app/http-backend-2`.

---

## HTTP Backend
Before choosing a provider or mutating the project, write a short application contract proof in your own reasoning. It must stay derived from the current user request and name:
- the requested record/entity class in neutral terms
- the user-facing query/filter input
- the collection shape expected from the backend
- the record fields that prove each item is a real application record for that request
- adjacent artifacts that would not satisfy the request unless the user explicitly asked for them, such as labels, suggestions, documents, metadata, technical identifiers without usable fields, or generic lookup results

Structured JSON is not enough by itself. A live proof is green only when at least one returned item satisfies that application contract. If the payload is structured but represents adjacent artifacts instead of the requested records, stop and report the contract proof incomplete; do not reinterpret adjacent data as success and do not move on to business sequence or UI work.

Before mutation, choose a direct record endpoint, not a provider catalog, dataset discovery, autocomplete, documentation, generic search, generic normalization, or entity-lookup endpoint. You must be able to name:
- the host-only `server`
- the stable path split between `baseDir` and transaction `subDir`
- one public user-facing query/filter variable
- the expected record collection shape (`array`, `items`, `features`, `records`, or equivalent)

A generic search-style endpoint is not a direct record endpoint merely because it returns labels, display names, descriptions, URLs, display metadata, or suggestions. Unless the user explicitly asked for a generic search or lookup app, the first rail must expose records whose fields already represent the requested application entities, with stable identifiers and useful domain fields in the payload.

When the product goal says users can search, treat that as a UI/filtering requirement, not permission to use a generic provider. The backend fast path still needs an endpoint that can be filtered by a public variable while returning structured records for the requested entities. Endpoint names or paths such as `lookup`, `autocomplete`, `suggest`, or `entity` are disqualifying for the first rail unless the requested application contract is explicitly those generic results. A path segment named `search` is acceptable only when live proof returns structured application records with useful fields, not labels/descriptions alone.

Creating an `HttpConnector` commits the run to that HTTP rail. Do not create exploratory connectors for multiple providers. A second `HttpConnector` for another host is not a repair; it is a failed headless run. Patching the existing connector with a different `server` hostname is also a provider switch, even when the connector name stays the same. If the first chosen rail cannot be proven after the repairs below, keep the rail and report the live proof incomplete instead of deleting it, changing its hostname, or trying another provider.

If the only endpoint you know requires uncertain dataset ids, fixed hidden variables, provider-specific headers, provider accounts, quota-limited demo credentials, catalog/discovery semantics, generic normalization or entity-lookup semantics, generic search semantics, or a static raw file URL with no server-side user filter variable, do not start mutating the project with that endpoint. Choose a simpler direct record endpoint when one is already known; otherwise report the HTTP proof incomplete.

A static file endpoint such as a raw `.json`, `.csv`, `.ndjson`, or repository-hosted data file is not a web-service search/list endpoint for this fast path unless the user explicitly asked for static-file integration. Do not compensate by downloading all records and filtering them in the UI or business sequence; that hides the missing HTTP request contract and usually bloats the run.

