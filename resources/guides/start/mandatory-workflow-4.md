# Escalation, unsafe shortcuts and completion checks

Read when: Escalation, unsafe shortcuts and completion checks. Summary: `convertigo://guides/start`.
Previous: `convertigo://guides/start/mandatory-workflow-3`.

---

6. Read `convertigo/recipe-http-business-sequence@1` or `convertigo/recipe-sql-crud@1` for the real data source.
7. Read `convertigo/recipe-ngx-data-page@19` before UI work as soon as the page will display business-sequence-backed data. Do not wait until after a raw UI shortcut has been created.
8. Read the matching deep handbook only if the recipe is not enough.
9. Close with `convertigo/validation-and-evidence@1`.

## Recommended MCP tools
- `project-list`
- `databaseobject-tree-get`
- `databaseobject-search`
- `palette-list`
- `palette-describe`
- `databaseobject-tree-apply`
- `batch-call`
- `requestable-execute`
- `crud-proof`
- `project-save`

## Anti-patterns / do not do
- Never read or edit `c8oProject.yaml`, `_c8oProject/**/*.yaml`, or `project.xml` as an authoring fallback. If a required MCP operation still fails after one targeted retry, stop and report the blocker without mutating project files.
- Do not use the removed CRUD-era flow (`children`, `create`, `properties-get/set`).
- Do not guess QNames, class names, or NGX palette entries.
- Do not start with RAG when tool metadata and tracked guides already answer the question.
- Do not generate defensive wrappers or catch-all error handling by default. Convertigo already surfaces standard execution failures; intercept only the cases where the UX truly needs it.
- Do not put external HTTP transport inside a sequence business sequence. HTTP-backed features must use `HttpConnector` plus a typed HTTP transaction for transport, and the business sequence must call it with `TransactionStep`.
- Do not validate only the tree shape when runtime behavior matters.
- Do not read every handbook by default. Read the smallest recipe and handbook set that matches the task.

## Completion checks
- You used targeted live inspection before mutation.
- The platform big-picture was read when the session needed Convertigo context.
- One matching recipe was chosen deliberately before broad exploration.
- The target QName and placement are exact and case-sensitive.
- Any created object came from the live palette or an already known canonical tree shape.
- Runtime validation happened where behavior matters.
- The next guide, if any, was chosen deliberately from the task shape.
- The project was saved after successful checks.
