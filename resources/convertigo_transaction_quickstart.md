# Convertigo Transaction Quickstart

This guide focuses on HTTP connector transactions and early validation.

## Basics
- Transactions are requestables: `<project>.<connector>.<transaction>`.
- Validate them directly with `requestable-execute` before wiring sequences.

## Configure connector and transaction
- `HttpConnector.url`: scheme + host, no trailing slash.
- `HttpTransaction.subPath`: starts with `/`.
- Set coherent `https` and `port`.
- Enable `httpInfo=true` during setup.

## Inspect and edit with tree tools
- Inspect with `databaseobject-tree-get` (use `childrenDepth=0` for focused properties).
- Apply edits with `databaseobject-tree-apply` (`at=self`, `mode=merge`).
- For specific creation templates, use `palette-list` + `palette-describe`, then apply via `tree-apply`.

## Validate early (mandatory)
```json
{
  "requestable": "<project>.<connector>.<transaction>",
  "variables": {},
  "recordSchema": true
}
```
- Check final URL and response type.
- Fix connector config first if payload is unexpected.

## Error handling
- Prefer explicit sequence branching (`If`/`IfThenElse`/`JIf`) over hidden retries.
- Keep transport diagnostics visible (`httpInfo=true` during debug).
- If position-based creation fails, create with `at=inside` then reorder with `databaseobject-move`.

## Recommended demo endpoints
- `https://api.ipify.org?format=json`
- `https://worldtimeapi.org/api/ip`
