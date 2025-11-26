# Convertigo Transaction Quickstart

This guide focuses on requestables of type *transaction* (HTTP connectors) and how to validate them early before wiring sequences.

## Requestable basics
- Sequences and transactions are both *requestables*: each has its own input variables, isolated scope, and output.
- Treat the connector+transaction as one requestable you can call directly via `requestable-execute <project>.<connector>.<transaction>`.

## Configure the HTTP connector
- `HttpConnector.url`: scheme + host, **no trailing slash** (e.g., `https://httpbin.org`). Do not set it to `/` or leave it blank.
- `HttpTransaction.subPath`: must start with `/` (e.g., `/ip`). Final URL is connector `rootPath` + `subPath` (e.g., `https://httpbin.org/ip`). Avoid double slashes.
- Set `https=true` for HTTPS targets, `https=false` for plain HTTP. Pair it with an explicit `port` (443 for https, 80 for http). **Do not leave port at `0`**: if `HttpInfo.url` shows `:0`, fix `https` and `port` before continuing. This is mandatory even if the property hints do not warn about it.
- Enable `httpInfo=true` while building to see the effective URL/headers and diagnose bad targets.

## Inputs & variables
- Add request variables as needed (type, default, required). Each transaction has its own set of variables and scope.
- For SmartTypes or sources in transaction steps, call `databaseobject-properties-get includeHints=true` to read the `llmHint` guidance.

## Validate early (mandatory)
- Right after configuring URL/subPath/https/port, call:
  ```
  tools/call convertigo.requestable-execute {"requestable":"<project>.<connector>.<transaction>","variables":"{}"}
  ```
  Add `"recordSchema": "true"` on this first run so the schema is learned before you wire SmartTypes in sequences.
  - Check `HttpInfo.url` and response `Content-Type`. If you see `//` or HTML instead of JSON, fix the connector before proceeding.
- Only after the transaction returns the expected payload, wire it into a sequence (CallTransaction) and add fallback logic (If/Then/Else) if offline mode is required.

## Error handling patterns
- No global "continue on error": wrap the request step in If/Then/Else (or JIf) and branch to a fallback JSON when the HTTP call fails. Keep `httpInfo=true` while debugging.
- If `databaseobject-create` with `mode=after` throws a decoding error, create with `mode=inside` then reorder via `databaseobject-move`.
- If the body is missing or HTML, re-check `baseDir` + `subPath` to avoid `//`, and validate with `httpInfo=true` via `requestable-execute` on the transaction.
- There is no try/catch step: wrap the HttpTransaction in If/Then/Else (or JIf) to produce a fallback JSON on error/offline.

## Choose a reliable demo endpoint
- Prefer stable endpoints such as `https://api.ipify.org?format=json` (public IP) or `https://worldtimeapi.org/api/ip` (time by IP) instead of `httpbin.org`, which is often unreachable from sandboxes.
