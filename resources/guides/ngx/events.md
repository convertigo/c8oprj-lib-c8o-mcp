# Action execution order and business errors

Read when: Action execution order and business errors. Summary: `convertigo://guides/ngx`.
Previous: `convertigo://guides/ngx/page-structure`. Next: `convertigo://guides/ngx/http-search`.

---

## Where events and actions belong

### Event placement rules
Use events where user or lifecycle intent is clear:
- page enter/init when data must load on page arrival
- button/tap when the user retries, submits, or navigates
- explicit shared-action entry points when reuse is intended

Do not place events arbitrarily just because they are reachable in the tree.

Typical placements:
- page lifecycle events for first load or refresh-on-enter
- button or tap events for retry, submit, open detail, or confirm actions
- shared action stacks only when the same chain is reused from several entry points

### Common action chains
Sequence-backed chain:
1. trigger event
2. set loading state
3. call sequence
4. map success to page state
5. map empty result to empty state
6. map failure to error state
7. expose retry path

FullSync-backed chain:
1. trigger event
2. call fullsync action
3. normalize result into page state
4. preserve loading/empty/error semantics

Why this is the right way:
- page behavior stays predictable
- the agent does not invent one-off action trees every time

Common trap:
- calling the backend is the only thing wired; loading/empty/error/retry remain structural stubs

### Execution order inside an event
The generated code fixes the order, so the tree must express it:
- actions that are siblings under the same event start together (`Promise.all`); they do not wait for each other's result
- they start in tree order, and each one reads its properties and variables when it starts: a `SetLocalAction` placed above a call has already set its local when the call reads its variables (a page event that copies `navParams` into locals and then calls the data sequence gets the values). A sibling never sees another sibling's asynchronous result, such as a call's `out`
- the children of an action start after that action resolves and read its result as `out`; several children of the same action again run in parallel
- the action's Failure handler runs only when the call is rejected (network, timeout, engine exception)
- a sequence that returns a business failure as an `error` element, such as an `XMLErrorStep` or a business sequence contract field, resolves normally: the Failure handler does not run

- inside the children of an `IfAction`, `out` is the `IfAction` result, not the result of the call above it

Good pattern:
- `CallSequenceAction` → child `IfAction` on `out?.error` → toast or error state, and a sibling child for the success path, when those children do not read the call result
- when they do: `CallSequenceAction` → child `SetLocalAction` storing `out` (for example `lastResult`) → its child `IfAction` on `c8oPage.local?.lastResult?.error` → toast and state updates reading `c8oPage.local?.lastResult`

Bad pattern:
- the result toast is a sibling of the `CallSequenceAction`: it runs before the response arrives and shows stale state
- the business error is expected in the Failure handler: it never fires for an `error` element

### Where sequence and fullsync calls belong
Use `CallSequenceAction` when:
- the page depends on a backend business sequence or server-side orchestration
- the contract already exists and the UI should consume it directly

Use `CallFullSyncAction` when:
- the page is working against synchronized local data
- offline/local query semantics are the right source of truth

Do not hide these calls inside arbitrary custom wrappers when a normal action stack already expresses the flow clearly.

Canonical searchable data chain:
1. input control uses `UIDynamicElement#Input` with a deliberate binding for the query value
2. submit button uses `UIDynamicElement#Button`
3. button event contains `UIDynamicAction#CallSequenceAction` targeting the public business sequence
4. query variables are modeled as `UIControlVariable` children of the call action
5. result lists/details bind from the call output or stable business sequence source using `SC` whenever possible
