# Knowledge Inbox

This directory is the intake area for future domain exploration before direct patching of tracked MCP guides and prompts.

## Intent
- collect deep Convertigo knowledge without patch collisions
- separate exploration from editorial integration
- keep one editor/maintainer responsible for the tracked corpus

## Runtime layout
- `knowledge/inbox/<batch>/proposal.md`
- `knowledge/inbox/<batch>/evidence.json`
- `knowledge/inbox/<batch>/target-files.json`
- `knowledge/inbox/<batch>/open-questions.md`

## Rules
- explorer agents write proposals only
- explorer agents do not patch tracked guides or prompts directly
- one editor merges accepted knowledge into the real corpus
- once the format is stable, domain ownership can be limited to one resource and one prompt per domain
- source order for proposals:
  1. current MCP guides and prompts
  2. `/Users/nicolas/git/convertigo-doc`
  3. RAG
  4. colleague repos and prior prompts
  5. ask for the best example project only when the concept is still ambiguous or high-stakes

## Current backlog signals
- Add Gradle/build/mobile/CI knowledge and later tooling based on `convertigo-gradle-guide.md`.
- Consider a generic project file MCP tool for non-YAML files only.
- Keep `_c8oProject/*.yaml` out of any future generic file-write tool.
- Use example projects only when docs, RAG, and current guides still leave a concept ambiguous.

## Current ownership targets
- backend: `resources/convertigo_backend_sequences.md` + `prompts/convertigo_backend.md`
- http: `resources/convertigo_integration_http.md` + `prompts/convertigo_http.md`
- sql: `resources/convertigo_integration_sql.md` + `prompts/convertigo_sql.md`
- ngx: `resources/convertigo_frontend_ngx.md` + `prompts/convertigo_frontend_ngx.md`
