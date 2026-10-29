# Preflight checks

Checks that catch MCP frictions before a supervised agent run finds them. Run them on a disposable Studio: they
create and delete scratch projects (`PfContract`, `PfTrap01`...`PfTrap10`). The Studio of a supervised run (port
18110) is refused unless `--allow-port` names it. None of them sends a prompt to an agent or calls a gateway model.

The bearer comes from `CONVERTIGO_MCP_TOKEN`, else from the `convertigo` proxy entry of `~/.claude.json`
(`C8O_MCP_HEADERS`). The default port is `C8O_PORT`, else 18086.

| Check | Command | Time |
| --- | --- | --- |
| MCP contract, offline | `node --test tests/scripts/validate_preflight_contract.cjs` | 1 s |
| MCP contract, live | `python3 tests/preflight/contract_live.py [--port N] [--json out.json]` | 2 to 5 min |
| Engine pitfalls, live | `python3 tests/preflight/pitfalls_live.py [--port N] [--only 1,6]` | 1 min |
| Engine-context soak | `python3 ../lib_ConvertigoAssistant/tests/preflight/soak_contexts.py [--port N] [--minutes 10]` | 10 min |

## MCP contract (`contract_live.py`)

It builds `PfContract` with the tools an agent uses (starter import, connector, `sql-transaction-create`,
`business-sequence-create`, `ngx-page-create`, tree-apply, rename, move, `batch-call`, `upsert-crud`...), then checks:

- **qnames**: right after each call, every string of the answer shaped like a QName of the project opens with
  `databaseobject-tree-get`; QName lists (`created`, `updated`, `touchedQNames`...) hold QNames only; at the end,
  `databaseobject-delete` takes each returned form, deepest first.
- **size**: no answer of the build, and none of the realistic heavy reads (log-view, marketplace-list, batch-call of 40
  reads, tree-get of a project or an app, project-lint, a large business-sequence-create, includeLogs, search,
  symbols, audit), goes over `--cap` (30 000 characters).
- **upsert**: `ifExists:"replace"`, tree-apply `mode:"replace"`, a merge or a create of the same tree twice,
  `scheduler-apply` and `upsert-crud` run twice leave no stale variable or step.
- **errors**: about 40 wrong calls (unknown QName or project, wrong types, refused SQL, failing step...) and the
  transport cases answer JSON, never HTML, with a readable message; the answer acts on the project it was given,
  and the structured content carries the same message as the text. A tree-apply value the engine cannot take (a
  text on a number property, an unknown enum constant or tag, a text other than true/false) fails the op with the
  property, the value and what it takes, and leaves the property as it was.
- **palette**: `palette-describe` takes every className `databaseobject-tree-get` gives on the NGX application
  (ApplicationComponent included), and the page lists `isRoot`.
- **schemas**: every structuredContent of the run matches the outputSchema of its tool, as Vibe's MCP client checks
  it: a property a closed object does not declare fails the call there with `mcp_transport_failed`.

`project-save` with an unknown project re-exports the MCP project itself while that defect is there: restore its
YAML with `git checkout -- _c8oProject c8oProject.yaml` in a git clone.

## Engine pitfalls (`pitfalls_live.py`)

Each trap is built the way an agent builds it, in its own scratch project, then run. A trap is CAUGHT when the MCP
refuses it, fixes it, warns about it (tool answer, `requestable-execute` hints, `project-lint`) or a served guide
states it, MISSED otherwise. Several paths are tried when an agent has several (generator or tree-apply, map or
array properties):

1. object literal `{}` in a JS SmartType
2. IfStep condition that is not a boolean
3. `{{variable}}` holding several statements
4. `IN ({list})` with a multivalued variable
5. `{x} IS NULL`
6. HSQLDB identity: first seed on a fresh database, reseed after `DELETE`
7. project deleted then created again with the same HSQLDB URL
8. `StepVariable` outside a call step
9. nested `st:` QName
10. SmartType object on a plain property
11. `c8oPage` in a control property (the template has no `c8oPage`)

## Engine-context soak (`lib_ConvertigoAssistant/tests/preflight/soak_contexts.py`)

For 10 minutes, two Tigo tabs read `AgentReadResponseRouter` as the page does, the Assistant's `agent_events`
read and a run pilot's read go to the Bridge, and `connections.List` is counted every 30 s. The count must stay flat
once each poller has its own context; a control phase first proves that a new context per read shows up.
