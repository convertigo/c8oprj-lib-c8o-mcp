# Mandatory workflow

Read when: Mandatory workflow. Summary: `convertigo://guides/start`.
Previous: `convertigo://guides/start/overview`. Next: `convertigo://guides/start/mandatory-workflow-2`.

---

## Mandatory workflow

### Tags and ordered memberships

On engines with the shared tag domain, `tags-get` and `tags-apply` expose the
same contract as Eclipse and Studio web, with normal MCP bearer authentication
and no administrator browser session. Use `scope:"projectObjects"` with an
exact loaded project name for sequence tags, or `scope:"workspaceProjects"`
for local project organization. Read the revision, canonical `targets` and
typed `contributions` first. Each mutation sends that exact `revision`, one
`action` and an `input` object; stale revisions and invalid metadata are refused.

Definitions use stable ids independent of labels; color belongs in
`definition.presentation.color`. `assign` appends ordered `tagIds`; `reorder`
must include all current memberships. Preserve unavailable metadata namespaces
when updating. Project edits remain drafts until `project-save`, and
`project-reload` discards unsaved changes; workspace-only edits persist locally.
`createFromReferences` seeds an editable project tag from the current transitive
references, rather than dynamically following future reference changes.

Flow metadata is offered only when the project has a Flow engine. Its
`definition.metadata.flow.configs` is an ordered list of configuration names
advertised by `tags-get`, not configuration values. The last assigned tag and
last configuration in that tag win on conflicting root branches. Configuration
definitions remain in the Flow engine and are edited through its authoring
tree/palette contract, not by writing a project metadata file manually.

### Minimal MCP session recipe
1. Read `convertigo://capabilities` directly to verify guidance freshness.
2. When a managed skill already names the resource URI or tool, skip `resources/list`, `resources/templates/list`, and `prompts/list`. Discover catalogs only when routing is ambiguous, a named entry is unavailable, or guidance versions disagree.
3. Read one matching entry recipe. Use this start guide for an unknown route, `convertigo://recipes/quickstart` for unresolved route selection, and `convertigo://guides/platform` only for platform orientation.
4. Inspect the target workspace or subtree before any write call:
   - `project-list`
   - on an existing project, `project-brief({project})` once, then `project-brief({project, page})` for the page you change: pages, sequences, tables, sign-in, references, style index, project notes, and the objects of the page with their QNames; patch from them instead of searching
   - `databaseobject-tree-get` for what the brief does not answer
   - `databaseobject-search` when discovery is uncertain
5. If you need to create an object whose contract is not already known from a successful readback or the selected recipe, confirm the allowed entry with:
   - `palette-list`
   - `palette-describe`
6. Pick one matching recipe before the first broad mutation. For starter apps that display backend, HTTP web-service, SQL, or FullSync results, this means both `convertigo://guides/starter` for import and `convertigo://guides/data-page` before the first page mutation.
7. Do not call `rag-query` before the chosen recipe was tried.
8. If the task is standard SQL CRUD + starter NGX UI, prefer `convertigo://guides/crud` and `convertigo-crud-fastpath` over planner/specialist routing.
9. Decide whether the task truly fits `upsert-crud` before the first write call.
10. Use the exact project name requested by the user when it is technically valid. Do not invent prefixes, suffixes, or dates.
11. Build the mutation plan before the first write call.
