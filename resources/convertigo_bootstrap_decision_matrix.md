# Convertigo Bootstrap Decision Matrix

## When to read this
Read this at session start, before the planner or a specialist begins mutating a project.

## What this guide covers
- The minimum decisions to collect before coding.
- Which questions belong to `bootstrap` versus `planner`.
- How to avoid rediscovering environment facts already present in the project or runtime.
- How to produce a concise brief that a planner can execute immediately.

## Bootstrap-first rule
Use `bootstrap` as the canonical entrypoint when:
- the session is fresh
- the user’s brief is still broad
- the task touches several domains
- environment choices may change the implementation path

`bootstrap` is non-mutating. Its job is to reduce ambiguity, choose the right recipe, and hand off a usable brief.

## Minimum decisions to collect

### Always collect
- target project:
  - existing project
  - new project
- primary recipe/pattern:
  - `starter-extension`
  - `facade-stub`
  - `http-facade`
  - `sql-crud`
  - `ngx-data-page`

### Collect when data or environment matter
- database strategy:
  - no database
  - existing database
  - embedded HSQLDB
  - local Docker Postgres/MariaDB
- service/API strategy:
  - existing API
  - mock/seed
  - local-only starter flow
- local permissions:
  - may the tool start Docker locally?
  - may it import a starter/library?

For a new NGX project in the current MCP flow:
- starter import is the supported path
- do not ask the human to choose between “starter NGX” and “blank structure”
- if permission to import a starter matters, ask only that permission-sensitive question

### Collect only when the task requires it
- data cleanup policy for write proofs
- environment-owned credentials or symbol policy
- runtime stub expectations
- validation expectations that affect closure gates

## Question ordering
1. confirm target project or new project intent
2. choose the smallest matching recipe
3. ask only the environment decisions that can change the implementation path
4. stop asking once the planner can safely lock a contract and begin work

Do not front-load deep business questions that the planner can refine later from the target subtree.

## Question batch discipline
- Ask at most 1 to 3 concrete questions per turn.
- Prefer the smallest decisive batch over a long interview.
- Do not re-ask a decision that is already present in session context unless new runtime evidence clearly contradicts it.
- If the remaining uncertainty no longer changes the implementation path, stop asking and hand off to the planner.

## Use project knowledge before asking
Before asking the human for DB or service details:
- call `project-list`
- call `project-list-symbols` when symbols or environment-specific configuration may already answer the question
- when `project` is supplied, treat the default symbol scope as project-local; use `scope=all` only when global/cross-project context is truly needed
- inspect only the exact target subtree if needed

Why this matters:
- the session becomes faster
- repeated runs avoid asking for the same facts
- the planner inherits a cleaner brief

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
