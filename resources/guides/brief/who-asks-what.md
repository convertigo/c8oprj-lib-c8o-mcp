# Who asks what

Read when: Who asks what. Summary: `convertigo://guides/brief`.
Previous: `convertigo://guides/brief/overview`.

---

## Who asks what

### Bootstrap asks
- target project intent
- recipe selection
- DB strategy
- service/API strategy
- permission-sensitive local actions

### Planner asks
- only the missing decisions that block a safe mutation path
- contract decisions not already covered by bootstrap
- checkpoint-time adjustments or acceptance questions

### Specialists do not ask
Specialists never talk to the human directly. They return blockers or ambiguity to the planner.

## Brief shape for planner handoff
A planner-ready brief should contain at least:
- target project
- selected recipe/pattern
- environment strategy (DB/API/local services) when relevant
- known acceptance focus
- unresolved items, if any

The brief should be short enough to read once and actionable enough to start coding.

## Interactive state contract
When the session is interactive, end the turn with exactly one `<interactive_state>...</interactive_state>` block.

Bootstrap should use:
- `needs_input` when a concrete decision is still missing
- `checkpoint` or `done` when the brief is ready

Minimum JSON keys:
- `status`
- `stage`
- `summary`
- optional `questions`
- optional `decisions`
- optional `resumeContext`
- optional `nextRole`

For bootstrap, `stage` is always `bootstrap`.

## Recommended MCP tools
- `project-list`
- `project-list-symbols`
- `databaseobject-tree-get`
- `databaseobject-search`
- `resources/read`
- prompt discovery when the caller surface exposes it

## Anti-patterns / do not do
- Do not mutate the project in `bootstrap`.
- Do not ask for every implementation detail before selecting a recipe.
- Do not ignore project or symbol information that already answers the question.
- Do not hand off to the planner with a vague “build something like this” brief.
- Do not let specialists ask the human directly.

## Completion checks
- A concrete recipe is selected.
- The target project intent is known.
- Environment-sensitive decisions were collected only when relevant.
- The brief is concise, specific, and ready for the planner.
