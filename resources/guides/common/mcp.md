# Guidance freshness and MCP-only authoring

Read when: Guidance freshness and MCP-only authoring. Summary: `convertigo://guides/common`.
Next: `convertigo://guides/common/libraries`.

---

## Skill freshness

- Skill guidance version: `{{GUIDANCE_VERSION}}`.
- During bootstrap, compare this value with `MCP guidance version` in `convertigo://capabilities`. If the MCP value differs or is missing, treat the installed skill and MCP endpoint as out of sync; rerun `{{SETUP_SEQUENCE}}` for the current MCP endpoint or ask before project mutation.
- When the caller surface supports MCP request metadata, send `params._meta.convertigoGuidanceVersion` with this skill guidance version on the first guarded Convertigo `tools/call`; raw HTTP clients may use the `X-Convertigo-Guidance-Version` header. An `_meta.convertigoGuidanceWarning` mismatch requires setup refresh before project mutation. A missing-version warning is advisory when this skill version already matches `convertigo://capabilities`: continue the current task and let the managed host refresh its transport configuration.

## MCP-first rule

- Convertigo MCP is the only authoring surface. Every inspection and every mutation goes through Convertigo MCP tools.
- Convertigo project descriptors are MCP-owned. Never read or edit `c8oProject.yaml`, `_c8oProject/**/*.yaml`, or `project.xml` as an authoring fallback. If a required MCP operation still fails after one targeted retry, stop and report the blocker without mutating project files.
- Never edit or repair `_private/ionic`, `DisplayObjects`, `dist`, or other generated artifacts. They are diagnostic-only surfaces; fix the Convertigo source objects or the MCP generator instead.
- Do not run `npm run build` or other manual frontend builds outside MCP to close a task.
- Do not use shell, PowerShell, `rg`, or filesystem scans to rediscover MCP tool signatures, installed skill files, or examples already exposed by callable schemas and named guides. Never recursively search a drive root, user profile, workspace root, or generated frontend tree for browser/build diagnostics; use `mobile-builder-open` and `log-view`.
- Treat the live MCP catalog as the public source of truth: `tools/list`, `resources/list`, `prompts/list`. Use catalog discovery only when this skill cannot route the task, a named resource is missing, or the MCP reports a guidance mismatch.

