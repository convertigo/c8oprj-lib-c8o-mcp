# Scope, prerequisites and route selection

Read when: Scope, prerequisites and route selection. Summary: `convertigo://guides/brief`.
Next: `convertigo://guides/brief/who-asks-what`.

---

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
  - `business-sequence-stub`
  - `http-business-sequence`
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
- to make a value configurable, do not ask for a symbol to be created first: reference `${my.symbol=defaultValue}` directly; the default avoids any load error and the symbol becomes editable in the administration console
- inspect only the exact target subtree if needed

Why this matters:
- the session becomes faster
- repeated runs avoid asking for the same facts
- the planner inherits a cleaner brief
