# Endpoint selection, transaction variables and direct proof

Read when: Endpoint selection, transaction variables and direct proof. Summary: `convertigo://guides/http-app`.
Previous: `convertigo://guides/http-app/http-backend`. Next: `convertigo://guides/http-app/http-backend-3`.

---

An endpoint whose result contract is selected by a technical query variable such as `dataset`, `table`, `source`, `index`, `catalog`, `collection`, `resource`, or equivalent is a catalog-style endpoint, not a direct record endpoint. Do not use that shape for this fast path unless the user explicitly supplied the exact dataset/resource identifier in the task.

Do not test public HTTP URLs through Convertigo MCP resource readers or non-existent helper requestables. `lib_ConvertigoMCP.mcp_resources_read` reads MCP guide resources only, not arbitrary URLs; `lib_ConvertigoMCP.mcp_http_get` is not a generic probe. The only valid live HTTP proof in this fast path is the typed Convertigo HTTP transaction you create, executed through `requestable-execute`.

1. Create one `connectors.HttpConnector`:
   - `server`: host only
   - `https`: boolean
   - `port`: usually `443`
   - `baseDir`: always set it explicitly. For a root-level endpoint use the empty string `""`; for a shared path prefix use no trailing slash
   - do not put generic lookup path segments such as `/lookup`, `/autocomplete`, `/suggest`, or `/entity` in `baseDir` for the first rail unless the user explicitly requested that result type
2. Create one `transactions.JsonHttpTransaction` under it:
   - `subDir`: endpoint path only, normally no query string
   - do not use generic lookup path segments such as `lookup`, `autocomplete`, `suggest`, or `entity` in `subDir` for the first rail unless the user explicitly requested that result type
   - do not use static raw file paths such as `*.json`, `*.csv`, or `*.ndjson` for the first rail unless the user explicitly requested static-file integration
   - query/filter inputs are `variables.RequestableHttpVariable` children
   - each query variable must have `httpName` equal to the upstream parameter
   - for the first proof, set only accepted request-variable properties such as `httpName`. Do not set guessed defaults such as `defaultValue`; if a default is needed later, read back the variable and use the real property name.
   - first proof must create only the public user-facing query/filter variable. Do not create fixed technical variables such as format, limit, mode, action, fields, type, scope, token, username, or API-key defaults before direct records are proven. If the endpoint returns HTML or invalid JSON until a technical constant such as `format=json` is added, it is not a clean first rail for this fast path.
   - after direct records are proven, fixed technical parameters may be added only as backend-owned defaults, not UI variables
   - do not set guessed properties such as `url`, `parameters`, `httpParameters`, `subPath`, or `timeout`
3. Execute the direct transaction with runtime path `<Project>.<Connector>.<Transaction>`, never a Studio QName.
4. `status:"ok"` is not enough. The payload must expose application records with useful fields that satisfy the application contract proof.
   After direct HTTP proof shows records, freeze that connector/transaction rail. Do not change `server`, provider, transaction name, or proven request variables while repairing the business sequence or UI.
5. If direct proof is `status:"ok"` but only `attr`, `context`, `generated`, or empty `text`, treat it as HTTP wiring failure:
   - read back connector and transaction
   - verify `server`, `baseDir`, `subDir`, and `RequestableHttpVariable.httpName`
   - do not add fixed technical variables, guessed headers, or extra query variables as the first repair
   - remove optional fixed query variables and prove the request with only the user-facing query variable when possible
   - retry the same provider once with alternate root slash shape: `subDir:"records"` vs `subDir:"/records"`; for `baseDir:""` and a root endpoint, try the leading-slash `subDir` shape before any provider change
   - if connector readback shows `baseDir:"/"` and transaction readback shows a leading-slash `subDir`, first set `baseDir:""` and rerun proof before any other repair
   - changing `server` or provider before this same-provider retry is non-compliant
