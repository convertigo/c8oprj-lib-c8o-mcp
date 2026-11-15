# Mandatory proof sequence

Read when: Mandatory proof sequence. Summary: `convertigo://guides/postgresql`.
Previous: `convertigo://guides/postgresql/overview`.

---

## Mandatory proof sequence
Run these in order before claiming success:
1. `requestable-execute` on `<PROJECT_NAME>.<CONNECTOR_NAME>.init_schema`
2. `requestable-execute` on `<PROJECT_NAME>.<CONNECTOR_NAME>.list_contacts`
3. `requestable-execute` on `<PROJECT_NAME>.<CONNECTOR_NAME>.count_contacts`
4. `requestable-execute` on `<PROJECT_NAME>.<CONNECTOR_NAME>.list_companies`
5. `requestable-execute` on `<PROJECT_NAME>.<CONNECTOR_NAME>.count_companies`

## Do not do on first pass
- no advanced pagination
- no search/sort extras
- no write-path family unless the brief explicitly requires it
- no dialect exploration beyond the connector plus the five transactions above

## Expected specialist output anchors
- `Primary Target`: `<PROJECT_NAME>.<CONNECTOR_NAME>`
- `Fast-Path Used`: `postgresql-service`
