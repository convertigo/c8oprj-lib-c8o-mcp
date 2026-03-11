# Convertigo Recipe: Extend a Fresh Starter Project

## When to read this
Read this for new POCs, demos, or benchmarks that start from a marketplace starter such as `template_ngxBuilderIonic`.

## What this guide covers
- How to use a starter project as the fast path instead of starting from a blank tree.
- How to extend the starter safely with backend, integration, and UI work.
- How to avoid starter-specific coupling.

## Mandatory workflow

### Golden path
1. Import the starter under a unique project name.
2. Confirm the project exists and is the only mutation target.
3. Add the minimal backend facade first.
4. Add connector or transaction work second.
5. Add or extend the UI page third.
6. Validate runtime and save.

### What the starter is for
The starter gives you:
- a valid project structure
- a working NGX app root
- a faster path to visible UI work
- fewer object-creation decisions at the beginning

The starter is not a reason to inherit its demo behavior blindly.

### Extension rules
- Keep new work under the imported benchmark or POC project only.
- Reuse existing app shell and page structure where it helps speed.
- Replace or extend demo placeholders with stable facade-backed structures.
- Keep contracts, not starter internals, as the long-term reference.

### Why this is the right way
- It dramatically reduces setup search.
- It gives a visible application surface quickly for demos.
- It avoids wasting agent time on root scaffolding that Convertigo already knows how to provide.

## Recommended MCP tools
- `marketplace-list`
- `marketplace-import`
- `project-list`
- `databaseobject-tree-get`
- `databaseobject-tree-apply`
- `project-save`

## Anti-patterns / do not do
- Do not mutate random existing workspace projects when the runner or planner already prepared a starter.
- Do not assume the starter's demo data model is the public contract for the new feature.
- Do not rebuild the root NGX structure from scratch if the starter already provides it.

### Common failure modes
- Agent spends too long discovering projects instead of using the prepared starter.
- New work leaks into the wrong workspace project.
- Starter demo structure is copied without replacing contract assumptions.

## Minimum validation proof
- Project import or project existence is explicit.
- The target project name is used consistently in writes and validation.
- Runtime proof shows the new behavior in the imported project, not in an unrelated workspace project.

## Completion checks
- Only the target starter-derived project was mutated.
- New backend and UI behavior lives inside the imported project.
- The project is in a reusable state for the next specialist or benchmark step.
