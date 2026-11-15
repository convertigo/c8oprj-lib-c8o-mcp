# Anti-patterns / do not do

Read when: Anti-patterns / do not do. Summary: `convertigo://guides/contract`.
Previous: `convertigo://guides/contract/mandatory-workflow`.

---

## Anti-patterns / do not do
- Do not let the UI bind directly to a raw connector payload when a business sequence should own the public contract.
- Do not start UI work from an unstable response shape.
- Do not leave the starter/default page as the dominant visible content while claiming that frontend work is progressing.
- Do not count a newly created secondary page as visible progress while the actual visible entry page still shows the untouched starter body.
- Do not replace the stub with a real integration that silently changes field names, nesting, or error format.
- Do not make the connector transaction itself the only public contract when the feature needs a stable business sequence.
- Do not let the planner stop at “build the backend first, then the UI later” when parallel work is possible.

## Completion checks
- A public business sequence requestable exists or is explicitly confirmed.
- A stub or real implementation returns the agreed response shape.
- UI or downstream consumers bind to the business sequence contract, not to temporary raw payloads.
- The real integration replaces the stub without contract drift.
- If the contract changed, that change is explicit and validated across consumers.
