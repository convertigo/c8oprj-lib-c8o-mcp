# Convertigo Transaction Quickstart

This guide focuses on requestables of type *transaction* (HTTP connectors) and how to validate them early before wiring sequences.

## Requestable basics
- Sequences and transactions are both *requestables*: each has its own input variables, isolated scope, and output.
- Treat the connector+transaction as one requestable you can call directly via `requestable-execute <project>.<connector>.<transaction>`.

## Configure the HTTP connector
- `HttpConnector.url`: scheme + host, **no trailing slash** (e.g., `https://httpbin.org`). Do not set it to `/` or leave it blank.
- `HttpTransaction.subPath`: must start with `/` (e.g., `/ip`). Final URL is connector `rootPath` + `subPath` (e.g., `https://httpbin.org/ip`). Avoid double slashes.
- Set `port` explicitly when needed (443 for https, 80 for http).
- Enable `httpInfo=true` while building to see the effective URL/headers and diagnose bad targets.

## Inputs & variables
- Add request variables as needed (type, default, required). Each transaction has its own set of variables and scope.
- For SmartTypes or sources in transaction steps, call `databaseobject-properties-get includeHints=true` to read the `llmHint` guidance.

## Validate early (mandatory)
- Right after configuring URL/subPath/port, call:
  ```
  tools/call convertigo.requestable-execute {"requestable":"<project>.<connector>.<transaction>","variables":"{}"}
  ```
  - Check `HttpInfo.url` and response `Content-Type`. If you see `//` or HTML instead of JSON, fix the connector before proceeding.
- Only after the transaction returns the expected payload, wire it into a sequence (CallTransaction) and add fallback logic (If/Then/Else) if offline mode is required.

## Error handling patterns
- No global “continue on error”: wrap the request step in If/Then/Else (or JIf) and branch to a fallback JSON when the HTTP call fails. Keep `httpInfo=true` while debugging.
- If `databaseobject-create` with `mode=after` throws a decoding error, create with `mode=inside` then reorder via `databaseobject-move`.
- If the body is missing or HTML, re-check `baseDir` + `subPath` to avoid `//`, and validate with `httpInfo=true` via `requestable-execute` on the transaction.
- There is no try/catch step: wrap the HttpTransaction in If/Then/Else (or JIf) to produce a fallback JSON on error/offline.
