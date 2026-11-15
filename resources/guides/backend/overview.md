# Scope, prerequisites and route selection

Read when: Scope, prerequisites and route selection. Summary: `convertigo://guides/backend`.
Next: `convertigo://guides/backend/step-taxonomy-that-matters-most`.

---

# Convertigo Backend Sequences

## When to read this
Read this when creating or changing backend sequences, business sequence requestables, helper orchestration, JSON output shaping, SmartType wiring, or step logic that must stay correct over time.

## What this guide covers
- How Convertigo sequences think: requestables, XML execution tree, JSON output steps, and business sequence ownership.
- Which step families matter most in enterprise backends.
- Where SmartTypes, source picker, strict mode, and Rhino 1.9.2 scoping create real friction.
- How to shape stable responses and validate them early.

## Read this after the recipe
If the task is a standard business sequence + stub or business sequence + integration path, read `convertigo/recipe-business-sequence-stub@1` first. Use this handbook when the recipe is not enough and you need the real semantics behind steps, SmartTypes, source picking, scoping, or output shaping.

## Convertigo sequence mental model

### A sequence is not “just code”
A Convertigo sequence is a tree of beans that executes into a result DOM. Even when the final payload is JSON-oriented, the execution model still matters:
- every step has a place in the tree
- source picker points to previous step outputs
- output and ordering are structural, not only textual
- helper logic can run without becoming part of the final contract

### Public business sequence vs internal helper
Use two levels when the backend grows beyond a trivial path.

Public business sequence:
- owns the request and response contract
- exposes stable nominal and error fields
- is the only requestable the UI or external callers should depend on

Internal helper sequence:
- owns reusable orchestration or source-specific adaptation
- can change without breaking the caller contract
- should not silently become the public API

Good split:
- `crm_contacts_facade`
- `crm_contacts_http_fetch`
- `crm_contacts_sql_search`

Bad split:
- one huge public sequence that mixes raw connector output, mapping, error handling, and internal state in the same script block

### XML result tree vs JSON-oriented response
Convertigo sequences always execute in a structured tree. JSON-oriented steps help you produce a deliberate payload, but they do not remove the underlying step ordering rules.

Use explicit JSON steps when:
- the contract is JSON-shaped
- the public response needs stable field order or naming
- the backend must hide connector-specific raw structure

Do not rely on “whatever the inner call returns” as the public output if the contract matters.

### Strict mode and source semantics matter
Strict mode changes how sourced elements are passed when one sequence calls another requestable. If you want text, source the text node explicitly when needed instead of assuming the whole element will coerce the way you expect.

Use source picker with this mindset:
- source the exact producer step
- source the exact node or text that represents the contract value
- do not guess the XPath

