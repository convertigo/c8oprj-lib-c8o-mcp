# Convertigo Vibe Quickstart

## When to use this prompt
Use this prompt when the caller is Mistral Vibe and the task should run through the Convertigo MCP without user interaction. This is an adapter prompt, not a replacement for the shared Convertigo recipes.

## Read these guides first
- `convertigo://capabilities`
- `convertigo://recipes/quickstart`
- `convertigo://resources/convertigo-start`
- `convertigo://resources/convertigo-vibe-start`

Then read the smallest matching shared recipe before mutation:

- new starter app: `convertigo://resources/convertigo-recipe-starter-extension`
- HTTP web-service backend facade: `convertigo://resources/convertigo-recipe-http-facade`
- data-backed NGX page: `convertigo://resources/convertigo-recipe-ngx-data-page`
- standard SQL CRUD + starter NGX UI: `convertigo://resources/convertigo-crud-fastpath`
- existing deterministic CRUD edit: `convertigo://resources/convertigo-crud-edit-fastpath`
- final review or evidence: `convertigo://resources/convertigo-validation-and-evidence`

## Mission
- Make Vibe use the `convertigo-vibe-generalist` skill and the `Convertigo` MCP server.
- Discover MCP resources and prompts before choosing a route.
- Keep Vibe-specific setup isolated from Codex resources.
- Execute the selected shared Convertigo recipe autonomously.
- Return concise proof and one MCP critique item if the run exposes a resource gap.

## Mandatory workflow
1. Confirm the `Convertigo` MCP server is available by calling a lightweight tool such as `Convertigo_project-list`.
2. If direct resource APIs are unavailable, use `Convertigo_requestable-execute` to call `ConvertigoMCP.mcp_resources_list` and `ConvertigoMCP.mcp_prompts_list` without URI/name arguments, then `ConvertigoMCP.mcp_resources_read` with `variables.uri` for known guide URIs.
3. Read the required startup guides.
4. Select one shared recipe.
5. Inspect the target project or confirm it is absent before creation.
6. Mutate only through Convertigo MCP tools.
7. Validate behavior through the proof tool appropriate to the recipe.
8. Save successful mutations with `Convertigo_project-save`.

## Headless contract
- Do not ask the user to repeat Convertigo rules that are already in the guides.
- Use the exact requested project name when technically valid.
- Ask for input only when credentials, destructive ambiguity, or missing external services make progress impossible.
- Do not modify Codex setup files, Codex skills, or generated Convertigo artifacts.
- In CLI harnesses, repeat `--enabled-tools` once per allowed tool. A comma-separated value is treated as one tool pattern.
- Do not invent Convertigo requestables. For guide content, call `ConvertigoMCP.mcp_resources_read` with the exact guide URI.
- For a fresh NGX starter app, import `template_ngxBuilderIonic` with the exact requested project name after reading the starter recipe.
- For any app that consumes an HTTP web service, read `convertigo-recipe-http-facade` before creating the connector, transaction, or facade sequence. Open data APIs are only one example of this HTTP-backed rail.
- Mutate the visible entry page first; do not leave the starter home dominant while creating only a secondary page.
- Prefer direct `Convertigo_databaseobject-tree-apply` calls for the first UI event/action chain. If `Convertigo_batch-call` is used later, nested `calls[].tool` values are unprefixed MCP ids such as `databaseobject-tree-apply`, not Vibe tool names such as `Convertigo_databaseobject-tree-apply`.

## Output format
Return these sections in order:

- `Selected Guides`
- `MCP Bootstrap`
- `Chosen Recipe`
- `Actions`
- `Proof`
- `Residual Risks`
- `MCP Critique`
