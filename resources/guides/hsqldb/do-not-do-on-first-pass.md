# Do not do on first pass

Read when: Do not do on first pass. Summary: `convertigo://guides/hsqldb`.
Previous: `convertigo://guides/hsqldb/canonical-sql-statements`.

---

## Do not do on first pass
- no `MERGE INTO`
- no advanced pagination
- no search/sort extras
- no write-path family unless the brief explicitly requires it
- no dialect exploration outside this template until the five proof calls are green

## Expected specialist output anchors
- `Primary Target`: `<PROJECT_NAME>.<CONNECTOR_NAME>`
- `Fast-Path Used`: `embedded-hsqldb`
