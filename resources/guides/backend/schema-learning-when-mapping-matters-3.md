# Public output flags and canonical backend patterns

Read when: Public output flags and canonical backend patterns. Summary: `convertigo://guides/backend`.
Previous: `convertigo://guides/backend/schema-learning-when-mapping-matters-2`. Next: `convertigo://guides/backend/when-to-escalate-to-references`.

---

3. add one minimal boolean expression only when the filtering rule is explicit

## Output shaping and `output=true/false`
Not every step should contribute to the public response. Convertigo trees are easier to maintain when orchestration and response shaping stay separate.

Use output-bearing steps for:
- deliberate public fields
- deliberate public arrays/objects

Keep helper/orchestration steps out of the public response when:
- they are only intermediate
- they leak raw source details
- they would make the business sequence tree noisy or unstable

Common trap:
- leaving every helper step visible, then sourcing against accidental structure or exposing implementation details

Rule of thumb:
- business sequence response tree should contain contract structure
- helper steps should exist for orchestration, not public leakage

## Canonical backend patterns

### Pattern 1: business sequence + stub
Use when:
- planner must lock the contract fast
- UI or specialist work must start now
- the real integration is not ready yet

Structure:
1. public variables
2. nominal top-level fields
3. error top-level fields
4. `__stub`-aware behavior if runtime stub proof is needed

Why this is the right way:
- contract exists before full implementation
- UI and integration can work in parallel

Common trap:
- adding a stub payload that does not match the final public shape

Minimum validation proof:
- `requestable-execute` on nominal path
- `requestable-execute` with stub proof when the scenario requires it

### Pattern 2: business sequence + orchestration behind it
Use when:
- the sequence must call connectors or helper sequences
- the public contract must stay independent of source systems

Structure:
1. input normalization
2. helper or transaction call
3. mapping steps
4. final explicit public response

Why this is the right way:
- source-specific change stays behind the business sequence

Common trap:
- connector response leaks into the public payload after a “temporary” shortcut

Minimum validation proof:
- direct inner validation if the source is new
- business sequence validation afterward

### Pattern 3: explicit error payload
Use when:
- upstream systems may fail
- UI or client logic expects consistent top-level fields

Good error pattern:

```json
{
  "status": "error",
  "source": "http",
  "items": [],
  "total": 0,
  "error": {
    "code": "upstream_failed",
    "message": "Remote service unavailable"
  }
}
```

Do not let exceptions or raw connector details become the public error contract accidentally.

### Pattern 4: JSON response assembly
Use when:
- multiple sources must become one stable object
- row or XML structures must be remapped

Order:
1. gather source data
2. transform into stable field names
3. assemble one explicit root object
4. validate the final contract

## Indispensable step families to teach first
If an agent knows only a small set at first, prioritize these:
- `CallSequence`
- `CallTransaction`
- `JsonObjectStep`
- `JsonArrayStep`
- `JsonFieldStep`
- `IfThenElse` / `IfExistThenElse`
- `Iterator`
- `Return`
- small JavaScript / simple expression steps
- explicit error shaping steps

These cover most enterprise business sequence work without forcing the agent to rediscover the whole step catalog.
