# Anti-patterns / do not do

Read when: Anti-patterns / do not do. Summary: `convertigo://guides/http`.
Previous: `convertigo://guides/http/business-sequence-mapping-patterns`.

---

## Anti-patterns / do not do
- Do not bind UI or downstream logic directly to raw HTTP payloads.
- Do not skip direct transaction validation.
- Do not build the mapping blind when schema capture is available.
- Do not treat `port` coercion as solved without a behavior check.
- Do not change public field names when replacing a stub with the real path.
- Do not guess transport behavior when builder/log/runtime evidence already exists.

## Completion checks
- Connector configuration is internally coherent.
- Raw transaction behavior is known.
- The business sequence contract is explicit and stable.
- Stub/live parity is proved when required.
- Transport evidence exists for failures instead of guesswork.
