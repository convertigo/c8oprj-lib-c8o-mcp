# Error Handling

Read it when a tool answers an error, before retrying. Summary: `SKILL.md`, in this folder.

---

## Error Handling

- Validation errors mean the no-code JSON must be corrected, not bypassed.
- If compile or create answers `reduced is not valid JSON`, the error names the position and shows the surrounding text: the whole argument was received, it is never a transport truncation. Fix the JSON at that position and resend the same call; if it fails twice, split the creation further (incremental creation above). On `empty_form`, the skeleton was lost: resend it, do not rebuild the application through edits on an empty form.
- If a tool call fails without a diagnostic, or reports `server_call_interrupted`, retry the same call once with identical arguments before changing strategy. Only after a second identical failure should you investigate or report it.
- `baserow_schema_unavailable` means the columns of a connected table could not be read with the authenticated No Code account. Call `nocode-baserow-catalog-list` once, confirm the table is listed, then retry the same create or edit. Never remove Baserow connections or fall back to local data to get past this issue; if it persists, report the table and the diagnostic.
- Investigate persistence errors using returned diagnostics and read-only `nocode-form-get` when a saved id is available; do not retry creation after a successful or partial save. Writes must still go through `nocode-form-create`, `nocode-form-edit`, or `nocode-form-update`; Baserow catalog discovery must still go through `nocode-baserow-catalog-list`.
- Builder, project, server logs and low-code diagnostics are outside the NoCode token scope. Report what the allowed tools expose and defer deeper server investigation to an administrator.
