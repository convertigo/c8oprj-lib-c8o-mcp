# Convertigo CRUD Edit Fast Path

For an existing deterministic green CRUD project: crud-status -> optional early mobile-builder-open(wait=false) -> upsert-crud -> backend crud-proof -> ngx-page-create for new pages -> viewer readiness -> project-lint -> browser-verify -> project-save. ngx-page-create never overwrites an existing page: patch it through databaseobject-tree-apply, or delete and recreate it. Preserve rows and unrelated spec fields. Never run init_schema by hand or reset demo data to repair a schema/value defect; allowDataReset:true requires a reset requested by the user. Use ALTER TABLE/UPDATE for existing data repairs. Delete any temporary proof row by id. Replace demo auth_login before delivery: named accounts with a password use the lib_UserManager login recipe (convertigo://guides/auth/email-password-with-lib-usermanager). Before deployment/export run mobile-builder-build.

## Drawers
- `convertigo://guides/crud-edit/overview` — Scope, prerequisites and route selection.
- `convertigo://guides/crud-edit/running-upsert-crud-again` — Running upsert-crud again.
- `convertigo://guides/crud-edit/server-side-checks-validation` — Server-side checks (validation).
- `convertigo://guides/crud-edit/canonical-crud-additions-to-express-direct` — Canonical CRUD additions to express directly in the spec.
- `convertigo://guides/crud-edit/two-canonical-examples` — Two canonical examples.
