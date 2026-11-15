# PostgreSQL starter NGX

Read when: PostgreSQL starter NGX. Summary: `convertigo://guides/crud-cases`.
Previous: `convertigo://guides/crud-cases/overview`.

---

## PostgreSQL starter NGX
- Same order of calls as HSQL.
- Use PostgreSQL credentials and `mode=postgresql`.

## MariaDB starter NGX
- Same order of calls as HSQL.
- Use MariaDB credentials and `mode=mariadb`.

## Proof expectations
- `upsert-crud.status == "success"`
- backend `crud-proof.transactions.missing == []`
- backend `crud-proof.sequences.missing == []` when sequences are enabled
- each `ngx-page-create` call answers the created QNames, without error
- `project-lint` reports no `error` finding
- `browser-verify` answers the verdict `passed`

## Disposable validation projects
- Prefer fresh names such as `CrudSmokeHsql_<timestamp>`, `CrudSmokePg_<timestamp>`, and `CrudSmokeMaria_<timestamp>`.
- Do not use `MiniCRM` as a proof target for the tool itself; it is too easy to inherit stale mutations from prior agent runs.
