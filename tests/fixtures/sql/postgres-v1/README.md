# PostgreSQL Benchmark Fixture

This fixture is used by the Phase 4 SQL benchmark scenario.

Defaults:
- database: `convertigo_bench`
- user: `bench`
- password: `bench`
- seeded rows:
  - `seed-a` / `Seed A`
  - `seed-b` / `Seed B`
- deterministic write row:
  - `phase4-row` / `Phase 4 Row`

Lifecycle:
- one fresh PostgreSQL container per SQL benchmark run
- init scripts create the schema and seed data
- teardown uses `docker compose down -v`

Runner contract:
- the campaign runner creates a runtime folder under `tests/campaigns/<candidateId>/fixtures/sql/<runId>/`
- the runner writes `fixture.env` and `metadata.json` in that runtime folder
- the runner calls `reset.sh up <runtime_dir>` before the SQL scenario and `reset.sh down <runtime_dir>` after the scenario
