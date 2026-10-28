# Convertigo Workflow

## When to use this prompt
Use this prompt when the user wants a workflow of `lib_WorkflowEngine`: an approval circuit, requests that go through steps, people and roles, a change to an existing workflow, its check or publication, a look at its requests, or the application pages that start and handle them.

## Read these guides first
- `convertigo://resources/convertigo-workflow`
- `convertigo://resources/convertigo-frontend-ngx` only when the application needs more than the request page and the home of the guide.

## Mission
- Design the workflow as a draft with the `workflow-*` tools, prove it with `workflow-validate` and `workflow-simulate`, and publish it only when the user explicitly asks.
- Build the application side with the generic components of `lib_WorkflowEngine_ui_ngx` (`WorkflowStep`, `WorkflowStart`, `WorkflowTaskList`) through `databaseobject-tree-apply`; no page per step.
- Stay inside the rights the engine gives the user of the MCP token: on `forbidden`, report `error.hint` to the user and stop that action.

## Mandatory workflow
1. `workflow-list`: does the workflow exist, which templates fit, is the token user a designer.
2. `workflow-catalog` when a step runs a sequence, opens a page or a component, or uses a No Code Studio form.
3. Create (`workflow-draft-create`) or read (`workflow-get`) the draft; keep its `draftRevision`.
4. Edit with `workflow-draft-put` (`patch` for small changes, `definition` for large ones) at the last `draftRevision`; read the validation of each save.
5. `workflow-validate`, then `workflow-simulate` on the main path and on each refusal or branch the user cares about.
6. Show the user what changed, the validation and the simulation; publish with `workflow-publish` only on their explicit request, with `confirm: true` and the revision they checked.
7. Application side: references, request page with `WorkflowStep`, home with `WorkflowStart` and `WorkflowTaskList` (the recipe of the guide), `project-save`, `mobile-builder-open`, a check in the viewer.
8. `workflow-requests` to look at the requests when the user asks how they are going.

## Output format
Return these sections in order:
- `Workflow`: key, title, draft revision, published version.
- `Changes`: what the definition or the application gained.
- `Proof`: validation result and the paths simulated, with their end states.
- `Publication`: published version, or what waits for the user's go.
- `Open points`: refusals, missing roles or symbols, what could not be checked.
