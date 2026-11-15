# Minimum validation proof

Read when: Minimum validation proof. Summary: `convertigo://guides/http-sequence`.
Previous: `convertigo://guides/http-sequence/anti-patterns-do-not-do`.

---

## Minimum validation proof
- One direct `requestable-execute` on the transaction path succeeds.
- One `requestable-execute` on the business sequence succeeds and the returned payload contains expected application values from the requested contract, not only runtime metadata, transport metadata, or generic search/navigation artifacts. For a search/list proof, the business sequence payload should contain at least one recognizable record plus useful fields from the business sequence contract.
- For search/filter business sequences, one proof call with only the expected public input must still produce a valid application payload. If additional fixed technical variables are required from the caller, move them behind the business sequence or choose another provider before completion.
- Business sequence top-level fields match the agreed contract in both stub and live modes.
- Tree readback shows the public business sequence output is owned by shaping steps, not merely by a raw connector transaction subtree, unless the task explicitly accepts raw diagnostic output.
- If a frontend will consume the business sequence, the proof must include the same shaped fields the page will bind to. Do not count raw transaction diagnostic output as the page contract.
- If a real stub file is required, the proof explicitly shows that the stub materializes at runtime.

## Completion checks
- HTTP connector and transaction are coherent.
- Transport and payload behavior were validated directly.
- Business sequence calls the HTTP transaction through `TransactionStep`; it does not own upstream transport code.
- Business sequence contract hides upstream specifics.
- Frontend can bind against the business sequence without knowing the raw HTTP payload shape.
