# Hard Rules

Read when: Hard Rules. Summary: `convertigo://guides/http-app`.
Previous: `convertigo://guides/http-app/overview`. Next: `convertigo://guides/http-app/hard-rules-2`.

---

## Hard Rules
- Import `template_ngxBuilderIonic` exactly once with the exact requested project name as the imported project name. Do not call `mobile-builder-open` immediately after import; mutate backend and UI first, save, then call `mobile-builder-open` once as the final builder proof.
- After the guide read, every project QName you inspect or mutate must start with the requested target project name, except the single `marketplace-import` template id, `lib_ConvertigoMCP.*` resource reads, and the marketplace libraries the project uses (imported with `marketplace-import({project, targetProject})`, read and called, never edited). Do not target generic roots such as `Convertigo`, `WorkSpace`, `Projects`, `C8O`, or another project. Do not create a project manually with `databaseobject-tree-apply`; project creation must come from `marketplace-import`.
- Do not call `project-list`, inspect unrelated local projects, or copy another project unless the user explicitly names a reference project.
- Do not edit `_private/ionic`, `DisplayObjects`, generated files, or YAML directly. Use MCP source objects.
- Calls of one message run concurrently: do not send ordered writes (`databaseobject-tree-apply`, `databaseobject-delete`, `project-save` that depend on each other) side by side in one assistant message; put them in one `Convertigo_batch-call` or successive messages.
- Treat every `status:"partial"`, skipped/rejected property warning, failed operation, or child patch error as a stop-and-repair signal before continuing. If a partial create touched the UI tree, read back the affected root and delete/recreate the malformed child before adding more objects; do not build on a partially applied subtree.
- If a write involving `DoubleBinding`, `varValue`, `directiveSource`, or `SetLocalAction.Value` returns `status:"partial"` or any skipped property warning, do not create the next UI object. Read back that same object, patch the same property until it is accepted in the expected mode, then continue.
- After a green proof, targeted readback, or successful delete, continue with the next required MCP mutation immediately. Keep reasoning short and do not spend a turn restating evidence when the next object is already prescribed by this guide.
- Do not use generic test, placeholder, echo, fixture, tutorial, sample, mock, encyclopedia, web-search, or demo APIs for a real data-backed app unless the user explicitly asked for that source type.
- Never choose an HTTP API that requires credentials, API keys, tokens, usernames, demo accounts, or quota-limited sample access. Do not hide those values in backend defaults; choose a no-credential direct record endpoint or report proof incomplete.
- Do not probe public HTTP URLs through guessed MCP helpers. Create the typed HTTP transaction and prove that transaction through `requestable-execute`.
- Do not delete template placeholder connectors or starter infrastructure unless it blocks the requested feature.
- Visible starter body cleanup is required for the target page. Delete exact starter placeholder nodes, or replace the whole visible content with a complete application subtree, then read back the parent and verify no starter placeholder QName or removal comment remains.
- User input controls must set the `DoubleBinding` property directly on `ngx.components.UIDynamicElement#Input`. Never create a child binding object and never use the input `Value` property for the user query/filter value.
- Every primary visible action trigger must have a direct `ngx.components.UIText#UIText` child with a non-empty plain label before the final save. If the trigger subtree exists but the label readback is empty or missing, repair the same button before opening the builder.
