# Visible records, isolation and final evidence

Read when: Visible records, isolation and final evidence. Summary: `convertigo://guides/vibe`.
Previous: `convertigo://guides/vibe/result-state`. Next: `convertigo://guides/vibe/diagnostics`.

---

- Result rows must display enough of the business sequence contract to be useful, not only a generic label. When records expose multiple stable fields, render at least three distinct application details across the row, such as a display label/name, one identifier or code field, and one quantitative, date, location, category, or status field. If fields are nested under a common object such as `record.properties`, use iterator expressions for those nested fields, for example `{{ record.properties.label }}`, `{{ record.properties.id || record.properties.code }}`, and a third available detail. Do not invent fields that are absent from the proven business sequence payload.
- Minimum complete UI order in headless loops: create page-enter locals, input, button, `CallSequenceAction` with `UIControlVariable`, child result `SetLocalAction` with normalized `{items,total,query}`, `ForEach` bound to `?.results?.items`, at least three row details, save, mobile-builder proof, final answer. Add optional loading/error polish only after this visible backend-to-list path exists.
- After a final backend proof, save, and mobile-builder proof, do not reload the skill or restart broad verification in the same headless run. Provide the final answer; the external harness will perform the independent validation pass.

## Isolation rules
- Set `VIBE_HOME` to a fresh directory for every benchmark loop.
- Delete the generated benchmark project before each new loop.
- Delete the isolated Vibe home before each new loop so `_setupVibe` installs the current adapter from scratch.
- Use `enabled_skills = ["convertigo-vibe-generalist"]` in isolated homes to prevent global skills from influencing the result.
- Provide model credentials through the process environment or CI secret store, for example `MISTRAL_API_KEY`.
- Do not modify the Codex `convertigo-generalist` skill or `~/.codex/config.toml` from a Vibe loop.
- Do not copy secrets, `.env` files, shell histories, or unrelated user configuration into an isolated Vibe home.

## Tool naming in Vibe
Vibe exposes Convertigo MCP tools with the server name prefix. For a server named `Convertigo`, use names like:

- `Convertigo_project-list`
- `Convertigo_requestable-execute`
- `Convertigo_databaseobject-tree-get`
- `Convertigo_databaseobject-tree-apply`
- `Convertigo_mobile-builder-open`
- `Convertigo_project-save`

Use only the tools needed for the selected recipe. Keep `Convertigo_rag-query` for last-resort gaps after the start guide and recipe were read.

## Validation evidence
For a successful Vibe benchmark run, collect:

- the installed Vibe skill path and config path from `_setupVibe`
- evidence that Vibe called at least one Convertigo MCP tool
- the selected guides and recipe
- the exact target project name
- runtime proof through `requestable-execute`, `mobile-builder-open`, or `crud-proof` depending on the recipe
- a final `project-save` when mutations succeeded
- one concise MCP critique item when the run reveals missing guidance

