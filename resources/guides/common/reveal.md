# Optional Studio reveal mode

Read when: Optional Studio reveal mode. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/viewer`. Next: `convertigo://guides/common/proof`.

---

## Optional UI reveal mode

- If the host context says Convertigo reveal mode is enabled, pass `reveal:true` only on supported mutation/viewer tools that should visibly move Studio while you work: `databaseobject-tree-apply`, `mobile-builder-open`, `nocode-form-create`, `nocode-form-edit`, and `nocode-form-update`.
- If those mutations are grouped with `batch-call`, pass top-level `reveal:true`; the batch reveals the final touched object after its deferred refresh.
- Do not add `reveal:true` to read-only calls. For `mobile-builder-open`, use `wait:false` for reveal/focus polls and omit `reveal` on long readiness calls.
- Treat a `result.reveal.status` of `skipped`, `unsupported`, or `intent` as a UI hint, not as a mutation failure.
