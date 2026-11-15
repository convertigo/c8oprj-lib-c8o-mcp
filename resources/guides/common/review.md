# Read-only reviews and French deliverables

Read when: Read-only reviews and French deliverables. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/crud`. Next: `convertigo://guides/common/auth`.

---

## Project review route

- Use this route when the user asks for a Convertigo project review, audit, expertise report, security/quality review, hardening plan, recommendations, client synthesis, or V1/V2 comparison.
- This route is static review by default. Do not mutate the project unless the user explicitly asks for fixes; label the limit as `static review only`, `static review plus runtime checks`, or `static review plus code changes`.
- Choose the mode first: `fresh review`, `progress review`, `client synthesis`, or `detailed expertise note`. If older reviews exist, prefer `progress review` and compare old recommendations against the current state before adding new findings.
- Frame the scope explicitly as backend only, frontend only, or both. Keep detailed backend and frontend conclusions separate first; merge only at synthesis level unless the user asks for one combined report.
- Inventory before judging. Backend inventory covers connectors, transactions, sequences, requestable exposure, references, authentication, administration, files/exports/mail, dynamic SQL, tests/debug/disabled nodes, and branch/tag governance. Frontend inventory covers pages, backend calls, shared components, shared actions, fragments, menus, disabled nodes, console logs, duplicated orchestration, old project references, and branch/tag governance.
- Reason from effective runtime exposure: absent `accessibility` means effectively `Public` on a sequence and `Private` on a transaction; absent `authenticatedContextRequired` means effectively `false`. `Hidden` does not restrict callers. Recommend hardening targets such as `Public -> Hidden`, `Public -> Private`, and `false -> true`; do not recommend merely defining the property.
- Backend default stance: `Public` should be exceptional and deliberate; business sequences usually target `Hidden + authenticatedContextRequired=true`; internal helpers usually target `Private`; transactions should not remain directly requestable by convenience alone. Before recommending `Private`, map visible callers first.
- Frontend doctrine: fragments are a bad practice unless narrowly justified; large admin pages are architecture smells; repeated orchestration chains should become shared actions; reusable shared components may belong in a shared library.
- Build findings from direct evidence, ordered by severity. For each finding name the affected object, then state observed evidence, risk, and recommended target state.
- For V1/V2 comparisons, structure the review as: major V1 recommendations, current-state changes, `treated` / `partially treated` / `not treated` / `removed from the perimeter`, then new priorities.
- For client-facing reports, avoid repository jargon such as `YAML`, `_c8oProject`, descriptor, or file-level paths unless implementation detail is requested. Use audience terms: sequence, transaction, page, shared component, shared action, backend service, flow, exposure, access control, delivery governance.
- Suggested deliverables when files are requested: `revue_securite_qualite.md`, `revue_frontend_securite_qualite.md`, `synthese_client_backend_preconisations.md`, and `synthese_client_frontend_preconisations.md`; use `_v2` or `_v3` for explicit later passes.

