# Convertigo Workflow

## When to read this
Read this when the user wants an approval circuit, a request that goes through steps and people, a process with roles, deadlines or emails, or an application built on `lib_WorkflowEngine` (designing, changing, checking or publishing a workflow, or adding the pages that start and handle its requests).

## What this guide covers
- What must be in the workspace, who the tools act as and what that user needs.
- The tool rail: discover, create a draft, edit it, validate, simulate, publish on request, read requests.
- The definition syntax: fields, start form, states, actions, views, progress, how a step is done (page, component, No Code Studio form, external page, sequence).
- The application side: references, a request page with `WorkflowStep`, a home with `WorkflowStart` and `WorkflowTaskList`, the screen flow, your own field components.
- The Workflow Studio, and the pitfalls.

The full references are the readmes of the libraries: `marketplace-describe` with `project` `lib_WorkflowEngine` (engine, sequences, definition format, C8Oforms, emails, deadlines) and `lib_WorkflowEngine_ui_ngx` (components, actions, Workflow Studio) returns them from the workspace (their repositories: https://github.com/convertigo/c8oprj-lib-workflow-engine and https://github.com/convertigo/c8oprj-lib-workflow-engine-ui-ngx). Read them for an option this guide does not show.

## Prerequisites and identity

- `lib_WorkflowEngine` must be loaded (`workflow-list` answers `workflow_engine_missing` otherwise); `lib_WorkflowEngine_ui_ngx` too for an application. When they are missing, import them with `marketplace-import` if `marketplace-list` has them, else ask the user to import them into the Studio (project import of their repositories); never rebuild a workflow engine in the project.
- The data lives in the CouchDB database `workflow_engine` of the FullSync server. Never read or write it directly: every change goes through the tools, which call the sequences of the engine and nothing else.
- The `workflow-*` tools act as the user of the MCP token (`actor.user` in every answer, for example `c8o:admin` for a token created in the administration console) with the roles the engine gives that user: the global symbols `lib_WorkflowEngine.designers` and `lib_WorkflowEngine.admins` (comma separated user names, or `*`), or the sequence named by `lib_WorkflowEngine.rolesSequence`. Designing (list, get, create, save, validate, simulate a draft, publish, catalog) needs `WorkflowDesigner` or `WorkflowAdmin`; reading a request needs the rights of a user of that request, or `WorkflowAdmin`.
- A `forbidden` answer names the user and its roles in `error.hint`. Tell the user which symbol gives the role; never work around a refusal (no developer login, no role written in a session, no direct database call).

## Tool rail

1. `workflow-list` (design view): the workflows with their `draftRevision`, `publishedVersion`, `hasUnpublishedChanges`, validation counts and requests; the templates (`purchase-request`, `sample-approval`, `expense-orchestration`, `sample-form-controls`, and `Project:key` from the `workflows/definitions` folder of any loaded project). `view: "startable"` lists what the user can start.
2. `workflow-catalog`: what a step can use: sequences (`serviceReady` for a service step), NGX pages with their routes, shared components with their inputs, published No Code Studio forms (150 entries by default: narrow with `project`, `kind`, `search`). Read it before writing `ui` or `service`.
3. `workflow-draft-create`: a draft from a template (`templateKey`), a whole `definition`, a published No Code Studio form (`fromForm`, `circuit`), or blank. Pick the `workflowKey` now: it cannot change once published.
4. `workflow-get`: the draft (`definition`, `draftRevision`, `validation`, `versions`). `version: "published"` or a number reads a published version.
5. `workflow-draft-put`: save with `expectedRevision` = the `draftRevision` just read. Small changes: `patch`, a JSON merge patch (objects merge, `null` removes a key, a list is replaced whole: send the whole list). Large changes: the whole `definition`. Each save returns the new `draftRevision` and the validation; keep that revision for the next save. A `conflict` means someone saved in between: read again, redo the change on what you read.
6. `workflow-validate`: errors block publication, warnings do not; each has the `path` of the option. A definition can be checked before saving (`definition`).
7. `workflow-simulate`: without `event`, the screen of a state with `data` (actions and their fields, sections, notices, `fieldErrors`, progress, `ui`, `service`); with `event` and `payload`, where the action leads after the automatic routing (`steps[].moves`), or why it is refused (`code`, `details.fields`); with `path`, actions chained. Service calls, emails and data stores are skipped: to test the routing after a service step, put its result in `data`. `instanceId` dry-runs one action on a real request with the rights of the token user.
8. `workflow-publish`: only when the user explicitly asked to publish this workflow. Without `confirm: true` it publishes nothing and answers what would be published; with it, give the `draftRevision` the user checked. A draft with errors is refused; an unchanged draft answers `unchanged`. Running requests keep their version.
9. `workflow-requests`: the inbox (`scope` `inbox`), the requests started or acted on, every request (`all`, administrators), or one request (`instanceId`: state, data, screen of its step, `next`, history). Read-only.

Report to the user: the workflow key, the draft revision saved, the validation result, what the simulation proved, and whether it is published (version) or waits for their go.

## Definition syntax

```json
{
  "workflowKey": "purchase-request",
  "title": "Purchase request",
  "description": "Shown in the catalog of requests",
  "category": "Purchasing",
  "roles": [{ "key": "Manager", "label": "Manager" }, { "key": "Finance", "label": "Finance" }, { "key": "Buyer", "label": "Buyer" }],
  "startRoles": [],
  "readRoles": [],
  "instanceTitle": "=concat(data.item, ' (', data.quantity, ')')",
  "uniqueBusinessKey": true,
  "notifications": { "tasks": true, "completed": false, "language": "en" },
  "fields": {
    "item": { "label": "Item", "type": "text", "required": true },
    "quantity": { "label": "Quantity", "type": "integer", "required": true, "min": 1 },
    "unitPrice": { "label": "Unit price", "type": "currency", "required": true, "min": 0.01 },
    "total": { "label": "Total", "type": "currency", "mode": "read", "valueExpr": "round(data.quantity * data.unitPrice, 2)" },
    "decisionNote": { "label": "Comment", "type": "textarea", "rows": 3 },
    "orderNumber": { "label": "Order number", "type": "text" }
  },
  "initialData": { "quantity": 1 },
  "startForm": { "title": "New purchase request", "fields": ["item", "quantity", "unitPrice"] },
  "initialState": "routing",
  "progress": ["managerReview", { "label": "Order", "states": ["ordering", "ordered"] }],
  "ui": { "followNext": true, "exitPage": "home" },
  "states": {
    "routing": {
      "entrySet": { "total": "=round(data.quantity * data.unitPrice, 2)" },
      "always": [
        { "when": "data.total >= 1000", "target": "financeReview", "label": "1000 EUR or more" },
        { "target": "managerReview", "label": "Under 1000 EUR" }
      ]
    },
    "managerReview": {
      "label": "Manager review", "color": "blue", "roles": ["Manager"],
      "timeout": { "after": "2d", "event": "escalate" }, "reminder": { "after": "1d" },
      "view": { "sections": [{ "title": "Purchase", "fields": ["item", "quantity", "total"] }], "history": true },
      "on": {
        "approve": { "label": "Approve", "target": "ordering", "button": { "color": "success" }, "set": { "approvedBy": "=actor" } },
        "reject": { "label": "Reject", "target": "rejected", "confirm": "Reject this request?", "button": { "color": "danger" },
                    "payloadForm": { "fields": [{ "name": "decisionNote", "label": "Reason", "required": true }] } },
        "escalate": { "label": "Escalate", "target": "financeReview" }
      }
    },
    "financeReview": {
      "label": "Finance review", "color": "purple", "roles": ["Finance"],
      "on": { "approve": { "label": "Approve", "target": "ordering" }, "reject": { "label": "Reject", "target": "rejected" } }
    },
    "ordering": {
      "label": "Ordering", "color": "teal", "roles": ["Buyer"],
      "on": { "ordered": { "label": "Order placed", "target": "ordered", "payloadForm": { "fields": [{ "name": "orderNumber", "required": true }] } } }
    },
    "ordered": { "label": "Ordered", "color": "green", "final": true },
    "rejected": { "label": "Rejected", "color": "red", "final": true }
  }
}
```

Workflow: `workflowKey` (letters, digits, `-`, `_`, 80 at most), `title`, `description`, `category`, `roles` (`key`, `label`, `description`), `startRoles` (who starts; empty: anybody), `readRoles` (who reads every request), `instanceTitle`, `uniqueBusinessKey`, `notifications`, `fields`, `initialData`, `startForm`, `initialState`, `states`, `progress`, `ui`, `dataStore` (data kept in a No Code database table, with C8Oforms), `layout` (positions in the Workflow Studio diagram; keep it as read).

Fields (the catalogue, by name): `type` among `text`, `textarea`, `number`, `integer`, `currency`, `date`, `datetime`, `email`, `url`, `phone`, `select`, `multiselect`, `checkbox`, `boolean`, `user`, `json`; options `label`, `required`, `min`, `max`, `minLength`, `maxLength`, `pattern` (a regular expression) and `patternMessage`, `options` (values, or `{ value, label }`), `placeholder`, `help`, `width` (`full`), `rows`, `mode` (`edit` or `read`), `valueExpr` (computed), `defaultValue`, `visibleIf` (condition). Where a field is used (start form, action form, section), `{ "name": "iban", "label": "...", "required": true, "valueExpr": "..." }` changes its options there only.

Start form: `startForm` `{ title, description, submitLabel, fields }`, or `startForm.form` a published No Code Studio form (`published_<id>`) that starts the requests instead.

States: `label`, `description`, `color`, `roles` (who acts; `initiator` is the requester, `*` anybody; compared without case), `assignee` (expression giving user names), `final`, `on` (actions), `always` (automatic routing, the first rule whose `when` holds wins), `entrySet` / `exitSet` (data updates), `onEnter` (service calls), `timeout` (`after` `30m` / `4h` / `2d`, and the `event` fired), `notify` (`false`, or `{ to, subject, message }`), `reminder` (`{ after }`), `view`, `ui`, `service`. A state key starts with a letter, then letters, digits, `-` or `_`.

Actions (`on`): `label`, `target` or `stay: true`, `cases` (`[{ when, target }]`), `guard` (condition to offer it), `roles` (instead of those of the state), `payloadForm` (`{ title, submitLabel, fields }`, validated on the server), `set`, `actions` (service calls), `confirm`, `description`, `button` (`color`, `fill` `solid` / `outline` / `clear`, `icon` an Ionicons name, `iconSlot` `start` / `end`). Colours: `primary`, `secondary`, `tertiary`, `success`, `warning`, `danger`, `light`, `medium`, `dark`, `blue`, `indigo`, `green`, `teal`, `purple`, `orange`, `amber`, `red`, `gray`.

What a step shows (`view`): `sections` (`title`, `description`, `fields`, `visibleIf`; read-only), `notices` (`{ text, when, color, icon }`, `text` a text or an `=expression`, a list gives one notice per item), `fieldErrors` (`=data.checks.errors`, or `{ field: "text or =expression" }`: errors under the fields, such as a check that sent the request back), `history` (`true`: the history with the step).

Progress (`progress`): the steps the users see, in order: a state key, or `{ label, states, key }` for several states shown as one.

Expressions: a value starting with `=` in `set`, `entrySet`, `input`, `instanceTitle`, `text`; conditions (`when`, `guard`, `visibleIf`) are written without `=`. Variables `data`, `payload`, `actor`, `roles`, `instance`, `workflow`, `transition`, `businessKey`, `state`, `input`, `result`, `item`, `error`; functions `nowIso now today date millis addMinutes addHours addDays daysBetween isEmpty isNumber len lower upper trim contains startsWith endsWith number string bool round floor ceil abs min max sum count coalesce concat join keys get json uuid hasRole`. No `eval`, no Java.

### How a step is done

| State option | The step is done | Notes |
|---|---|---|
| none | in a page of the application that holds `WorkflowStep` (the `requestPage` of the components) | the default: the form comes from the definition |
| `ui.page` | in that page of the application (`supplier/:instanceId`; `:instanceId` replaced) | the page loads the request (`WorkflowLoadInstanceAction`) and acts (`WorkflowActAction`), or holds `WorkflowStep` |
| `ui.component` | in a shared component (`Project.Component`) | the request page shows it in an `If` on `viewModel.ui.component` |
| `ui.form` | in a No Code Studio form (`published_<id>`) | `WorkflowStep` shows it in a frame; the bridge `lib_WorkflowEngine_c8oforms` is needed |
| `ui.url` | in a page of another application (`{instanceId}` replaced) | opened in a new tab |
| `service` | by a sequence, as the `system` actor | see below |

`ui.params`: values given to the page, component or form (`=` expressions on the request). Workflow `ui`: `followNext` (the next step of the same user opens; default true) and `exitPage` (the route the users go back to when the next step is not theirs).

Service step:

```json
"checking": {
  "service": { "call": "Erp.checkBudget", "input": { "amount": "=data.total" }, "result": "budget",
               "retries": 1, "errorTarget": "manualCheck", "errorResult": "budgetError" },
  "always": [{ "when": "data.budget.ok", "target": "review" }, { "target": "manualCheck" }]
}
```

The sequence runs without the user session: make it `Private` with `authenticatedContextRequired=false` (`serviceReady` in `workflow-catalog`) and pass everything it needs in `input`. Without `successTarget`, the `always` rules route on the `result`. `async: true` waits for a callback (`workflowCallback` with the token the sequence receives); `pendingResult` keeps the first answer. Calls in `actions` and `onEnter` take `{ call, input, result, when, onError }`.

## Application side (NGX)

An application of a workflow is a request page with `WorkflowStep` and a home with `WorkflowStart` and `WorkflowTaskList`, all from `lib_WorkflowEngine_ui_ngx`. The components read the workflow and draw every step (forms, buttons in the colours of the definition, sections, notices, errors under the fields, progress, history, C8Oforms frames, steps processed by the system), act and follow the screen flow: the application has no page per step. There is no dedicated tool: three `databaseobject-tree-apply` calls (one `batch-call`) build it. Replace `<App>`, the route `request/:instanceId`, the home page `pg:Page` (route `home` in the NGX starter) and `<workflowKey>`.

1. References, so the shared components are in the palette and deploy with the application (bare names: the libraries are loaded in the workspace):

```json
{ "target": "<App>", "at": "self", "mode": "merge", "tree": { "children": [
  { "name": "lib_WorkflowEngine", "className": "references.ProjectSchemaReference", "properties": { "projectName": "lib_WorkflowEngine" } },
  { "name": "lib_WorkflowEngine_ui_ngx", "className": "references.ProjectSchemaReference", "properties": { "projectName": "lib_WorkflowEngine_ui_ngx" } } ] } }
```

2. The request page (one `WorkflowStep`; its route carries the request):

```json
{ "target": "<App>.Application.NgxApp", "at": "inside", "tree":
  { "name": "Request", "className": "ngx.components.PageComponent#PageComponent",
    "properties": { "segment": "request/:instanceId", "title": "Request", "inAutoMenu": false },
    "children": [
      { "name": "PageEnter", "className": "ngx.components.UIPageEvent#UIPageEvent", "properties": { "viewEvent": "onDidEnter" }, "children": [
        { "name": "InitInstanceId", "className": "ngx.components.UIDynamicAction#SetLocalAction", "properties": { "Property": { "mode": "PLAIN", "value": "instanceId" }, "Value": { "mode": "SCRIPT", "value": "c8oPage.navParams?.get('instanceId')" } } },
        { "name": "InitEntered", "className": "ngx.components.UIDynamicAction#SetLocalAction", "properties": { "Property": { "mode": "PLAIN", "value": "entered" }, "Value": { "mode": "SCRIPT", "value": "Date.now()" } } } ] },
      { "name": "Content", "className": "ngx.components.UIDynamicElement#Content", "children": [
        { "name": "Step", "className": "ngx.components.UIUseShared#lib_WorkflowEngine_ui_ngx.MobileApplication.Application.WorkflowStep",
          "properties": { "sharedcomponent": "lib_WorkflowEngine_ui_ngx.MobileApplication.Application.WorkflowStep" },
          "children": [
            { "name": "instanceId", "className": "ngx.components.UIUseVariable#UIUseVariable", "properties": { "varValue": { "mode": "SCRIPT", "value": "local.instanceId" } } },
            { "name": "requestPage", "className": "ngx.components.UIUseVariable#UIUseVariable", "properties": { "varValue": { "mode": "PLAIN", "value": "request/:instanceId" } } },
            { "name": "refresh", "className": "ngx.components.UIUseVariable#UIUseVariable", "properties": { "varValue": { "mode": "SCRIPT", "value": "local.entered" } } } ] } ] } ] } }
```

3. The home: a `PageEnter` that sets `entered` (as above, on `<App>.Application.NgxApp.pg:Page`, `at` `self`, `mode` `merge`), then its content, here replacing the welcome card of the starter (`<App>.Application.NgxApp.pg:Page.Content`, `at` `self`, `mode` `replace`) with three `UIUseShared`:
   - `WorkflowStart` (`lib_WorkflowEngine_ui_ngx.MobileApplication.Application.WorkflowStart`): `workflowKey` PLAIN `<workflowKey>`, `mode` PLAIN `button`, `requestPage` PLAIN `request/:instanceId`;
   - `WorkflowTaskList` (`...Application.WorkflowTaskList`): `scope` PLAIN `inbox`, `workflowKey`, `requestPage`, `refresh` SCRIPT `local.entered`;
   - a second `WorkflowTaskList` with `scope` PLAIN `started`;
   - a heading above each list (an `h2` element with a `UIText`, "To do" and "My requests"): the lists show no title of their own.
   Each variable is a child `{ "name": "<input>", "className": "ngx.components.UIUseVariable#UIUseVariable", "properties": { "varValue": { "mode": "PLAIN" or "SCRIPT", "value": "..." } } }` named exactly as the input of the component (`workflow-catalog` with `project` `lib_WorkflowEngine_ui_ngx` and `kind` `components` lists them).
4. In the definition, nothing is needed for the steps drawn by `WorkflowStep` (the components open `requestPage`); set `ui.exitPage` to the home route (`home`) so users go back there when the next step is not theirs, and `ui.page` only for a step done in another page of the application.
5. `project-save`, then `mobile-builder-open` and check in the viewer. The requests need a signed-in session with roles: inside the Studio the application of `lib_WorkflowEngine_ui_ngx` offers the developer login of the engine (pick a user and roles) for manual tests; in production, your login flow sets the user (and `lib_WorkflowEngine.roles` in the session, or the roles sequence).

Main inputs: `WorkflowStep` `instanceId`, `requestPage`, `refresh`, `follow` (`here` default: the next step of the same user in this component; `pages`: the page of the next step), `history` (`auto`, `always`, `never`), `head`, `view`; event `changed`. `WorkflowStart` `workflowKey`, `mode` (`form` or `button`), `requestPage`, `follow` (`pages` default, or `here`), `label`, `askBusinessKey`, `businessKey`, `listPage`; event `started`. `WorkflowTaskList` `scope` (`inbox`, `started`, `involved`, `all`), `workflowKey`, `status`, `search`, `limit`, `requestPage`, `emptyText`, `refresh`; event `loaded`.

Your own field components (mode 2): instead of `WorkflowStep`, a request page holds `WorkflowStepHeader` (loads the request, title, progress, notices, sections; event `changed` gives `event.step`, kept in `local.step`), a `ForEach` on `local.step.fields` with a `Switch` on `field.kind` (`input`, `select`, `textarea`, `checkbox`, `read`) drawing your components bound to `local.step.values[field.name]` (two way) and `local.step.errors[field.name]`, then `WorkflowStepActions` (`step`, `follow`, `requestPage`; event `changed`). The readme of `lib_WorkflowEngine_ui_ngx` (Use your own field components) and the sample `WorkflowSampleSupplier` (page `SupplierRequestCustom`) give the full tree.

## Workflow Studio and other surfaces

- The Workflow Studio, the designer for people, is the page `studio` of the application of `lib_WorkflowEngine_ui_ngx` (`<server>/convertigo/projects/lib_WorkflowEngine_ui_ngx/DisplayObjects/mobile/studio`, for `WorkflowDesigner` and `WorkflowAdmin`; in C8Oforms, menu Workflows). It edits the same draft as the tools: a save there changes `draftRevision`, so read again before saving.
- Its simulator draws a step with `WorkflowStep` in preview; `workflow-simulate` gives the same view model as data.
- Deadlines and reminders fire only when the Private sequence `lib_WorkflowEngine.workflowProcessTimers` is scheduled: `scheduler-apply` with `project` `lib_WorkflowEngine`, `sequence` `workflowProcessTimers`, `cron` `0 * * * * ?`.
- Emails need `lib_WorkflowEngine.notifySequence` (and `usersOfRoleSequence` to find the members of a role); nothing is sent without it.
- C8Oforms (No Code Studio) with `lib_WorkflowEngine_c8oforms`: forms as start forms and steps, groups as roles, data in a No Code database. Its forms are published on their own (No Code Studio, or the Workflow Studio when it publishes the workflow).

## Pitfalls

- A tool answers `forbidden`: the token user lacks the role. Ask the user to add it to `lib_WorkflowEngine.designers` (or `admins`); do not call `workflowDevLogin` or `workflowSessionSetRoles`, and do not make a sequence of the engine reachable to bypass it.
- Always save with the `draftRevision` of the last read or save; never reuse an older one after a `conflict`.
- A merge patch replaces lists whole (`roles`, `always`, `fields` of a form, `sections`): send the complete list.
- Publish only on the user's explicit request, with the revision they checked; never as the last step of an edit.
- A field named in a form, section or `valueExpr` must exist in `fields` (warning otherwise); a state key must start with a letter (error).
- `=` starts an expression in values (`set`, `text`, `input`); conditions take none. A plain text in `set` is stored as text.
- Roles of a definition must match the roles the users get (case does not matter); `initiator` and `*` are special.
- A service sequence that needs the session, is `Hidden`, or requires an authenticated context fails: service steps run as `system` without session.
- Simulations skip service calls: give their result in `data` to test the routing after them.
- `sharedcomponent` takes the full QName `lib_WorkflowEngine_ui_ngx.MobileApplication.Application.<Component>`; the `UIUseVariable` names are the inputs of the component.
- The route of the request page must carry `:instanceId`, and every component gets the same `requestPage`.
- An application that uses the components must reference both libraries, or its build fails and it does not deploy them.
