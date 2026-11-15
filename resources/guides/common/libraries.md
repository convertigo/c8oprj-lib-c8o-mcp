# Standard libraries and bootstrap decisions

Read when: Standard libraries and bootstrap decisions. Summary: `convertigo://guides/common`.
Previous: `convertigo://guides/common/mcp`. Next: `convertigo://guides/common/batching`.

---

## Convertigo libraries are standard components

The marketplace libraries (`lib_*`, listed by `marketplace-list`) are standard Convertigo components, maintained with the platform and added to the workspace by `marketplace-import`: they are not external dependencies. A specification that asks for standard components, or limits external dependencies, asks for them. Build a capability a library provides only for a reason you write down (a feature it lacks, an explicit ban). For an NGX app take the `_ui_ngx` library, never a `_ui` one (former Mobile Builder).

| Need | Use |
|---|---|
| Admin list, table: sort, filter, paging, CSV or XLSX export | `lib_ExtendedComponents_ui_ngx` agGrid: `ngx-page-create` list `grid` |
| Charts | `libApexCharts` |
| CSV answered by a sequence; file download | `lib_csv_response`; `lib_download_file` |
| Login, accounts, SSO | `lib_UserManager` (+ `lib_UserManager_ui_ngx`), `lib_OAuth`, `lib_SAML`, `lib_LDAP`, `lib_FranceConnect` |
| PDF, Word or Excel documents from templates | `lib_fill_odt_pdf`, `lib_JasperReports` |
| Excel import and export | `lib_MicrosoftExcel_ui_ngx` |
| Calendar, planning; map, address | `lib_FullCalendar`, `lib_TuiPlanner`; `lib_Leaflet`, `lib_Geocoding_ui_ngx` |
| File upload, QR or barcode, kanban, rich text, date picker | `lib_ExtendedComponents_ui_ngx` |
| Payment; SMS | `lib_Stripe_ui_ngx`; `lib_Vonage` |
| Sending mail | the native step `steps.SmtpStep` |

## Mandatory bootstrap

Bootstrap is required once per agent conversation for a given MCP endpoint and guidance version, not once per user message. On follow-up turns, reuse the skill, capabilities, and route guides already present in the conversation context. Do not reopen this skill, reread `convertigo://capabilities`, or reread an already-used guide unless the MCP endpoint changed, the MCP reports a guidance-version mismatch, or the required bootstrap context is explicitly unavailable.

1. Read `convertigo://capabilities` and verify the skill freshness rule above.
2. Select exactly one primary route in the table below before mutation and read only its required guides, in order. Read fallback guides only for a concrete unresolved question.
3. Do not call `rag-query` before the chosen guide was read and tried.
4. If the user explicitly wants MCP-only work, or the starting workspace is empty or non-relevant, do not inspect the local shell workspace before the MCP route decision is made.
5. Before the first project mutation of a build, list the capabilities the task needs and match each one to the table above, or to `marketplace-list({search:"<capability>"})` (English or French words: tableau, graphique, export...). Read each candidate with `marketplace-describe` and import the ones you use; write each capability you build yourself, and why, in the decision log or `PROGRESS.md`.

## Task routes

{{TASK_ROUTES}}
