# Scope, prerequisites and route selection

Read when: Scope, prerequisites and route selection. Summary: `convertigo://guides/http`.
Next: `convertigo://guides/http/connector-setup-rules-that-matter`.

---

# Convertigo HTTP Integration

## When to read this
Read this when a feature needs an HTTP connector or HTTP transaction behind a Convertigo business sequence, especially when the endpoint is not a trivial JSON API.

## What this guide covers
- HTTP payload worlds in Convertigo: XML, JSON, text/binary.
- Connector and transaction setup rules that keep the transport coherent.
- Handler and transport diagnostics that should stay visible while integrating.
- Business sequence mapping patterns that prevent public contract drift.

## Read this after the recipe
If the task is a standard HTTP-backed business sequence, read `convertigo/recipe-http-business-sequence@1` first. Use this handbook when endpoint subtleties, payload shape, HTTP transaction type, or transport behavior go beyond the golden path.

## HTTP payload worlds

### XML-oriented endpoints
Use XML HTTP transactions when the upstream service is truly XML-based, such as SOAP or XML REST payloads.

Why this matters:
- the transaction model matches the response world
- source picking and downstream mapping stay predictable

Common trap:
- treating an XML service like a generic text service, then reparsing everything manually later

### JSON-oriented endpoints
Use JSON HTTP transactions when the service is JSON-native and you want Convertigo to help normalize the response into the sequence world.

Why this matters:
- JSON-to-tree conversion is already part of the intended workflow
- business sequence mapping is easier than manual ad hoc parsing everywhere

Common trap:
- letting the upstream JSON shape leak directly into the public contract

### Text, binary, or file-oriented endpoints
Use the standard HTTP transaction when the endpoint is not fundamentally XML or JSON:
- file download
- raw text
- binary payload
- mixed content where you need transport control first

Why this matters:
- the transaction type matches the transport reality
- business sequence logic can decide how to expose the result safely

Common trap:
- forcing everything into JSON assumptions even when the endpoint is file- or text-oriented

