# Error Handling

Read it when a tool answers an error, before retrying. Summary: `SKILL.md`, in this folder.

---

## Error Handling

- Validation errors mean the no-code JSON must be corrected, not bypassed.
- If compile or create answers `reduced is not valid JSON`, the error names the position and shows the surrounding text: the whole argument was received, it is never a transport truncation. Fix the JSON at that position and resend the same call; if it fails twice, split the creation further (incremental creation above). On `empty_form`, the skeleton was lost: resend it, do not rebuild the application through edits on an empty form.
- An answer with `repairs` succeeded: each entry says what the tools read with its only meaning (a `number` type as a text with `config.type` number, a variant `success` as `primary`, a page named in another case, a brace too many in the JSON text). Do not resend the call; write `to` next time. A JSON text repair names the place: check it if the structure there matters.
- `nocode-form-edit` answering `status: running` with an `editId` (a large form): the edit goes on on the server and is applied once. Call `nocode-form-edit({id, editId})` with no operations to wait for its answer; never send its operations again. A timeout of an edit without that answer: read the form's `rev` with `nocode-form-get find` before any retry.
- If a tool call fails without a diagnostic, or reports `server_call_interrupted`, retry the same call once with identical arguments before changing strategy. Only after a second identical failure should you investigate or report it.
- `baserow_catalog_failed`, `baserow_schema_apply_failed` or a failed `nocode-app-create` (for example `no password found for the current user`): the No Code database cannot be reached for this user. Call no other Baserow tool in this turn. Build what does not need the database with `nocode-form-create`, and tell the user what will not be saved until the database is reachable; never give a button an e-mail action only to pass validation.
- `baserow_schema_unavailable` means the columns of a connected table could not be read with the authenticated No Code account. Call `nocode-baserow-catalog-list` once, confirm the table is listed, then retry the same create or edit. Never remove Baserow connections or fall back to local data to get past this issue; if it persists, report the table and the diagnostic.
- Investigate persistence errors using returned diagnostics and read-only `nocode-form-get` when a saved id is available; do not retry creation after a successful or partial save. Writes must still go through `nocode-form-create`, `nocode-form-edit`, or `nocode-form-update`; Baserow catalog discovery must still go through `nocode-baserow-catalog-list`.
- Builder, project, server logs and low-code diagnostics are outside the NoCode token scope. Report what the allowed tools expose and defer deeper server investigation to an administrator.
