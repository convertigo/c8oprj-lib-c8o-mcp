---
name: convertigo-nocode
description: Use for Convertigo No Code Studio / C8Oforms work that must stay inside the Convertigo MCP no-code tools for forms and Baserow catalog discovery. Strictly forbids low-code, project, CRUD, mobile-builder, database-object, log-view, source-file, shell, and generated-artifact access; only the no-code tools may be used.
---

# Convertigo No-Code Only

Use this skill for Convertigo No Code Studio / C8Oforms tasks where the user wants MCP work restricted to no-code tooling.

The core rule is simple: stay on the no-code form rail. Do not use Convertigo low-code tools to compensate for missing no-code capability.

## Drawers

This file holds the rules of every turn. The rest of the skill is in drawer files next to this `SKILL.md`, in the skill's base directory: each `> Drawer` line stands where its rules belong, names one and says when to read it. Read a drawer with your file-reading tool before the step it covers, once per conversation, and only those the task needs: reading them is part of this skill, also where no other file may be read. If one cannot be read, say so in one sentence and keep to this file; never guess what it says.

Tool order: a new application over business records is one `nocode-app-create` call (`workflow-new.md`). Any other creation or change reads `nocode-form-contract-get` once per conversation, then writes reduced JSON (`workflow-new.md`, `form-rules.md`; for an application also `generation-quality.md`, `readable-interface.md`, `contextual-values.md` and `native-design.md`). An existing form is read with `nocode-form-get` before any proposal or change (`workflow-existing.md`), after `nocode-form-list` when it is named without its id (`forms-list.md`). A saved result is checked with `nocode-form-validate`, `nocode-baserow-rows-list` and `nocode-form-preview-capture` (`checks.md`). On an error, read `errors.md` before retrying.

## Skill freshness

- Skill guidance version: `2026-09-04.vibe-serial-transport-v1`.
- During bootstrap, compare this value with `MCP guidance version` in `convertigo://capabilities`. If the MCP value differs or is missing, rerun `_setupCodex` for the current MCP endpoint before using no-code mutation tools.
- When the caller surface supports MCP request metadata, send `params._meta.convertigoGuidanceVersion` with this skill guidance version on the first guarded Convertigo `tools/call`; raw HTTP clients may use the `X-Convertigo-Guidance-Version` header. An `_meta.convertigoGuidanceWarning` mismatch requires setup refresh before no-code mutation. A missing-version warning is advisory when this skill version already matches `convertigo://capabilities`: continue the current task and let the managed host refresh its transport configuration.

Bootstrap is required once per agent conversation for a given MCP endpoint and guidance version, not once per user message. On follow-up turns, reuse the skill, capabilities, and route guides already present in the conversation context. Do not reopen this `SKILL.md`, reread `convertigo://capabilities`, or reread an already-used guide unless the MCP endpoint changed, the MCP reports a guidance-version mismatch, or the required bootstrap context is explicitly unavailable.

## No-Code Authentication

No-code form reads, create, edit/update, and Baserow catalog operations require the authenticated No Code Studio user.

- In the integrated C8Oforms assistant, authentication is provided automatically by the host application and the MCP bearer session. Do not ask the user to copy or paste a token.
- Never print, summarize, request, store in generated form content, or expose the bearer token. Treat authentication as an invisible MCP capability.
- If a compatibility schema still exposes a `token` argument, pass an empty string. The actual credential is supplied out-of-band by MCP bearer authentication.
- Call `nocode-form-get`, `nocode-form-list`, `nocode-baserow-catalog-list`, `nocode-baserow-schema-apply`, `nocode-form-create`, `nocode-form-edit`, `nocode-form-update`, and `nocode-form-publish` normally when the tool is available; the integration supplies the authentication context.
- If a protected no-code tool still returns `missing_token`, `invalid_token`, or `expired_token`, report that the No Code assistant authentication is not ready and ask the user to retry or reconnect. Do not switch to low-code tools as a workaround.
- Compilation and validation may be done without authentication when the tool permits it.

## Convertigo MCP entry

- Expected MCP endpoint: `http://localhost:18082/convertigo/api/mcp`.
- Prefer the no-code MCP tools listed below over filesystem edits or low-code project mutations.

## Optional UI reveal mode

- If the integrated assistant or host context says Convertigo reveal mode is enabled, pass `reveal:true` only on supported no-code mutation tools that should visibly move No Code Studio while you work: `nocode-form-create`, `nocode-form-edit`, and `nocode-form-update`.
- Do not add `reveal:true` to read-only calls such as contract, compile, validate, or catalog tools.
- Treat a `result.reveal.status` of `skipped`, `unsupported`, or `intent` as a UI hint result, not as a no-code mutation failure.

## Hard Tool Boundary

Allowed Convertigo MCP tools:

- `nocode-app-create`
- `nocode-form-get`
- `nocode-form-list`
- `nocode-attachment-read`
- `nocode-form-contract-get`
- `nocode-baserow-catalog-list`
- `nocode-baserow-rows-list`
- `nocode-baserow-schema-apply`
- `nocode-form-compile`
- `nocode-form-validate`
- `nocode-form-create`
- `nocode-form-edit`
- `nocode-form-update`
- `nocode-form-publish`
- `nocode-form-preview-capture`
- `nocode-report-create`, only when it is listed (see Feedback to Convertigo)

> Drawer `forms-list.md` — Finding the user's forms: read it when a form is named without its id, or the user asks which or how many forms they have.

A file the user attached to the message (a spreadsheet, CSV, PDF, Word or text file) is read with `nocode-attachment-read` `{name}`: its sheets and rows, or its text, a page at a time with `offset`. Images come with the message itself. Never open an attachment by its path: the attachments folder is outside your sandbox.

## Publishing

Publishing makes a form available to its respondents, so `nocode-form-publish` runs only on the user's explicit request.

- Call it only when the user asks to publish this form ("publie-le", "mets-le en ligne", "check everything and publish it"). Never publish on your own initiative, to finish a create or an edit, or because a form looks ready: offer it instead.
- Publish the revision the user checked: pass `rev` from `nocode-form-get` (`form._rev`) or from your last create, edit or update, with `confirm:true`. `conflict` means the form changed since that read: read it again and tell the user what changed before publishing. `invalid` lists blocking issues: fix them only if the user asked for fixes, else report them.
- Leave `access` out unless the user said who may answer. Use `anonymous` (anyone with the link answers without signing in) only when the user asked for such a link. It applies to the first publication only: on a republication, `access_change_not_supported` means the user changes access in No Code Studio (Manage access rights).
- `unauthorized`: C8Oforms publishes only for the owner of the form or an editor with the publication right; say so and do not retry. `error`: the form may be partly published; tell the user to check it in No Code Studio and do not retry.
- On success, give the published `version`, who may answer (`access`) and the `link`; a `newer_revision_published` warning means a save during the publication was published, so tell the user. Sharing with respondents and the application's name, colors and icon are managed in No Code Studio.

## Changes the user confirms

The user can ask Tigo to confirm every change: the switch "Confirmer avant de modifier" next to the input bar, the Tigo settings or `/confirmer`. While it is on, each write (`nocode-form-create`, `nocode-form-edit`, `nocode-form-update`, `nocode-form-publish`, `nocode-app-create`, `nocode-baserow-schema-apply` in apply mode) waits for the user's answer on a card of the Tigo panel that shows what the call changes. Reads, validate and preview capture never wait.

- Call the write as usual: the card asks the user, so do not ask the same question in chat first. Group the operations of one change in one call, so the user answers one card.
- `awaiting_confirmation`: the user has not answered yet. Call the same tool again with exactly the same arguments, and do nothing else meanwhile.
- `refused` with `reason: "user"`: nothing was saved. Do not retry the change or a variant of it; ask the user in one sentence what they want instead. `no_answer`: say in one sentence what you wanted to change and ask whether to do it. `cannot_ask`: tell the user that this session cannot show the card and that turning the switch off lets you write.
- When the user asks you not to change anything without their agreement ("ne modifie rien sans mon accord", "ask me before you change anything") and the message does not say that change confirmation is on, tell them in one sentence that "Confirmer avant de modifier", next to the input bar, makes every change wait for their click. Until they turn it on, describe each change and wait for their explicit yes before calling a write tool.

> Drawer `checks.md` — Reading Baserow rows and Preview capture: read it before checking saved rows, a computed value or how a page renders.

## Feedback to Convertigo

When the MCP lists `nocode-report-create`, the user agreed to send Tigo's frictions to Convertigo. File at most one short report per turn, before your final answer, when one of these happened:

- A no-code tool, guide or prompt made you work around it.
- You needed a capability that no allowed tool gives: seeing how the saved form renders or behaves in a browser, reading the rows of a Baserow table, running a calculation, an expression or a flow, or anything else you told the user you could not do. This counts even when no tool failed.
- You worked around a missing capability: you reasoned without checking, added a diagnostic field to the user's form, or asked the user to look, test or copy values for you.

Telling the user about the limitation does not replace the report: do both. Say what you expected, what happened and how you got past it. Never report your own mistakes or a refusal you fixed at once. Describe the product problem only: never name the user's forms, pages, fields, Baserow workspaces, databases or tables, and never copy their data, emails or credentials. The user reviews the report before it is sent, unless they chose automatic sending.

NoCode bearer tokens cannot access `log-view`, even if older instructions or a broader catalog mention it. Use diagnostics returned by the allowed tools. If those are insufficient, report the failure and ask an administrator to inspect server logs through their authorized administration interface; do not bypass the restriction or request broader credentials.

Forbidden Convertigo MCP tools include, but are not limited to:

- Server log access through `log-view`
- Low-code database object tools such as `databaseobject-*`
- Sequence, transaction, connector, page, shared component, or source-object mutation tools
- CRUD and low-code generator tools such as `upsert-crud`, `crud-status`, `crud-proof`, `ngx-page-create`, and `ngx-theme-apply`
- Project administration or file tools such as `project-js-get`, `project-js-set`, `project-save`, `project-reload`, `project-delete`, and `marketplace-import`
- Mobile builder tools such as `mobile-builder-open`
- Batch wrappers such as `batch-call` when they would call anything outside the allowed list
- Local shell, filesystem, npm, frontend build, or generated artifact edits for Convertigo project repair

If the requested change cannot be completed with the allowed tools, stop and say exactly which no-code limitation blocks it. Offer the closest no-code-safe alternative if one exists. When `nocode-report-create` is listed, also file that limitation (see Feedback to Convertigo).

## Workflow

> Drawer `workflow-new.md` — Workflow steps 0 to 3: read it before creating an application or a form.
> Drawer `workflow-existing.md` — Workflow steps 4 to 7: read it before reading or changing an existing form, or listing or changing Baserow tables.

> Drawer `form-rules.md` — No-Code Form Rules: read it before writing reduced JSON or edit operations.

> Drawer `generation-quality.md` — Generation quality: read it before generating an application or adding pages, buttons, flows or data views.

> Drawer `readable-interface.md` — Readable interface pass: read it before laying out pages, buttons, lists, filters, conditions or flow triggers.

> Drawer `contextual-values.md` — Contextual-value pass: read it before prefilling or computing a value (`defaultFrom`).

> Drawer `native-design.md` — Native design pass: read it before choosing spacing, margins, padding, borders or button groups.

> Drawer `sources.md` — Sourceable Components and Baserow Source Pattern: read it before connecting a component, a choice list, a save or a deletion to Baserow.

> Drawer `errors.md` — Error Handling: read it when a tool answers an error, before retrying.

## Refusal Pattern

When a user asks for a low-code action while this skill applies, respond briefly:

```text
I can’t do that under the Convertigo no-code-only boundary because it requires <forbidden tool/category>. I can still <no-code-safe alternative>.
```

Do not call the forbidden tool first.
