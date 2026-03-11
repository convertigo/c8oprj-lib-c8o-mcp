# Convertigo MCP Quickstart

## When to use this prompt
Use this prompt to bootstrap a session, understand the platform quickly, choose the right recipe, and hand off to the right specialist role.

## Read these guides first
- If this is a fresh session, call `prompts/list` and `resources/list`.
- Then read:
  - `convertigo://capabilities`
  - `convertigo://recipes/quickstart`
  - `convertigo://resources/convertigo-start`
  - `convertigo://resources/convertigo-platform-big-picture`
  - `convertigo://resources/convertigo-engineering-workflow`

Read the smallest matching recipe next:
- fresh app or starter extension: `convertigo://resources/convertigo-recipe-starter-extension`
- facade sequence or stub contract: `convertigo://resources/convertigo-recipe-facade-stub`
- HTTP-backed facade: `convertigo://resources/convertigo-recipe-http-facade`
- SQL CRUD behind facade: `convertigo://resources/convertigo-recipe-sql-crud`
- NGX data page: `convertigo://resources/convertigo-recipe-ngx-data-page`

Read the deeper domain guides only when the recipe leaves open questions:
- `convertigo://resources/convertigo-backend-sequences`
- `convertigo://resources/convertigo-integration-http`
- `convertigo://resources/convertigo-integration-sql`
- `convertigo://resources/convertigo-frontend-ngx`
- `convertigo://resources/convertigo-validation-and-evidence`
- narrow references only when needed:
  - `convertigo://resources/convertigo-context-api`
  - `convertigo://resources/convertigo-json-quickref`

## Mission
- Bootstrap the session.
- Pick one matching recipe before broad exploration.
- Choose the specialist role that should execute the work.
- Keep Convertigo work MCP-first and object-first.

## Mandatory workflow
1. Read the built-ins, the start guide, and the big-picture guide.
2. Pick one matching recipe before any broad discovery.
3. Read the deeper handbook only if the recipe is not enough.
4. If the task spans backend, integration, and UI, read `convertigo://resources/convertigo-contract-first-delivery`.
5. Choose the matching specialist prompt from `prompts/list`.
6. Execute writes through MCP only.

## Specialist prompt routing
| Task shape | Specialist prompt |
| --- | --- |
| Contract-first planning or multi-track split | `convertigo-planner` |
| Sequence or facade implementation | `convertigo-backend` |
| SQL connector implementation | `convertigo-sql` |
| HTTP connector implementation | `convertigo-http` |
| NGX UI work | `convertigo-frontend-ngx` |
| Review or critique | `convertigo-critic` |

## Practical rules
- Start from a recipe whenever the task matches a known Convertigo pattern.
- Use `project-list`, `databaseobject-tree-get`, and `databaseobject-search` before the first write.
- Use `palette-list` and `palette-describe` when you need valid creatable objects.
- Reuse `tree-get` output structure as `tree-apply` input whenever possible.
- Do not browse unrelated workspace projects as implicit templates unless the task or guide explicitly names them as read-only examples.
- Use RAG only when the live catalog and tracked guides still leave the concept unclear.

## Output format
Return these sections in order:
- `Selected Guides`
- `Next Actions`
- `MCP Critique`
