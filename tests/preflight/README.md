# Preflight checks

Checks that catch MCP frictions before a supervised agent run finds them. Run them on a disposable Studio: they
create and delete scratch projects (`PfContract`). The Studio of a supervised run (port
18110) is refused unless `--allow-port` names it. None of them sends a prompt to an agent or calls a gateway model.

The bearer comes from `CONVERTIGO_MCP_TOKEN`, else from the `convertigo` proxy entry of `~/.claude.json`
(`C8O_MCP_HEADERS`). The default port is `C8O_PORT`, else 18086.

| Check | Command | Time |
| --- | --- | --- |
| MCP contract, offline | `node --test tests/scripts/validate_preflight_contract.cjs` | 1 s |
| MCP contract, live | `python3 tests/preflight/contract_live.py [--port N] [--json out.json]` | 2 to 5 min |

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
  and the structured content carries the same message as the text.

`project-save` with an unknown project re-exports the MCP project itself while that defect is there: restore its
YAML with `git checkout -- _c8oProject c8oProject.yaml` in a git clone.
