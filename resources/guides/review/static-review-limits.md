# Static review limits

Read when: Static review limits. Summary: `convertigo://guides/review`.
Previous: `convertigo://guides/review/frontend-review-doctrine`.

---

## Static review limits

Unless the user explicitly asks for runtime validation or edits:

- treat the result as a static review
- do not claim runtime behavior that was not tested
- separate evidence from inference

State the limit clearly:

- `static review only`
- `static review plus runtime checks`
- `static review plus code changes`

## Expected deliverables

Depending on the request, produce one or more of:

- backend detailed review
- frontend detailed review
- backend client synthesis
- frontend client synthesis
- merged client synthesis

When both backend and frontend are reviewed, keep the detailed reviews separate first. Merge only at the synthesis level unless the user explicitly wants one combined expertise report.

When the user wants files generated, prefer stable names so later V2/V3 passes stay comparable.

Detailed reviews:

- `revue_securite_qualite.md` for backend detailed review
- `revue_frontend_securite_qualite.md` for frontend detailed review

Client syntheses:

- `synthese_client_backend_preconisations.md`
- `synthese_client_frontend_preconisations.md`

When a previous generation already exists and the new pass is explicitly a new version, prefer:

- `*_v2.md`
- `*_v3.md`

If PDF or DOCX exports are requested, keep the same base name and change only the extension.
