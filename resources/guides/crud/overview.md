# Scope, prerequisites and route selection

Read when: Scope, prerequisites and route selection. Summary: `convertigo://guides/crud`.
Next: `convertigo://guides/crud/required-inputs`.

---

# Convertigo CRUD Fast Path

## When to read this
Read this first when the task is a standard SQL CRUD feature on top of a starter NGX app and the goal is reliable delivery, not broad exploration.

On a fresh session, do not jump here blind. Start with `resources/list`, use `prompts/list` when the caller exposes prompt discovery, then read:
- `convertigo://capabilities`
- `convertigo://recipes/quickstart`
- `convertigo://guides/start`

Then use this guide as the deterministic rail for the CRUD case.

## Scope
This fast path is the recommended public path for the current mono-agent recovery cycle.

In scope:
- starter NGX project or existing starter-derived project
- SQL CRUD scaffold
- hidden CRUD business sequences plus the generated auth skeleton
- the app's pages, built with `ngx-page-create` on the generated business sequences
- proof of the backend (`crud-proof`) and of the pages in a browser (`browser-verify`)

Out of scope:
- custom multi-track orchestration
- broad planner/specialist handoff
- complex handwritten NGX composition before proof
- RAG-first exploration
