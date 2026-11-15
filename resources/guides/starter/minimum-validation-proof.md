# Minimum validation proof

Read when: Minimum validation proof. Summary: `convertigo://guides/starter`.
Previous: `convertigo://guides/starter/mandatory-workflow-3`.

---

## Minimum validation proof
- Project import or project existence is explicit.
- The target project name is used consistently in writes and validation.
- Runtime proof shows the new behavior in the imported project, not in an unrelated workspace project.
- Timers, live updates, and interactions require two observations showing the expected change or an equivalent browser-control assertion. Without that proof, report the implementation as functionally unvalidated rather than successful, even when compilation and server logs are green.
- For backend-backed UI, tree readback shows `CallSequenceAction` and `UIControlVariable` under a real page event.
- Tree readback does not show the primary data page body as `ngx.components.UICustom#UICustom` or `htmlTemplate`.

## Completion checks
- Only the target starter-derived project was mutated.
- New backend and UI behavior lives inside the imported project.
- The project is in a reusable state for the next specialist or benchmark step.
