# Convertigo MCP Maintainer Brief

> Refreshed by `_refreshMaintainerDocs` from the live MCP catalog on `2026-03-16`. Live facts come from `mcp_initialize`, `mcp_tools_list`, `mcp_resources_list`, and `mcp_prompts_list`.

## Purpose

Maintain the `lib_ConvertigoMCP` project as the tool and onboarding layer for AI-driven Convertigo development.

This file is for maintainers working on the MCP itself, not for end users of the tools.

## Current State

- Public MCP endpoint: `http://localhost:18080/convertigo/api/mcp`
- Current protocol: `2025-06-18`
- Current server name: `convertigo-mcp`
- Current server title: `Convertigo MCP Server`
- Current live version at last refresh: `0.0.17`
- Current public catalog at last live verification on `2026-03-16`:
  - `29` tools
  - `25` resources
  - `9` prompts

## Product Posture

- The recommended public path is mono-agent MCP for standard SQL CRUD + starter NGX UI work.
- The current recommended prompt/resource pair is:
  - `convertigo-crud-fastpath`
  - `convertigo://guides/crud`
- Planner, critic, maintainer, benchmark, and feedback-triage flows remain available, but they are internal lab surfaces during the mono-agent recovery cycle.

Do not trust this file over the live server. Verify with:

1. `initialize`
2. `tools/list`
3. `resources/list`
4. `prompts/list`

## Source Of Truth Order

When documentation, prompts, and runtime disagree, use this order:

1. live MCP signature and behavior
2. repository implementation and exported schemas
3. repository docs, prompts, and tests
4. companion experiments in other repositories

The review artifacts under `review/` follow this rule.

## Canonical MCP Model

Convertigo MCP remains tree-first at the primitive level, with one supported deterministic fast path layered on top for standard SQL CRUD + starter NGX UI delivery.

- Inspect with `databaseobject-tree-get`
- Mutate with `databaseobject-tree-apply`
- Group operations with `batch-call`
- When host reveal mode is enabled, pass top-level `reveal:true` to `batch-call`; optimized batches reveal the final touched object after their deferred Studio refresh.
- Validate behavior with `requestable-execute`
- Persist with `project-save`

For standard SQL CRUD + starter NGX UI work on a new UI project, the recommended public rail is:

1. `marketplace-import`
2. `mobile-builder-open`
3. `upsert-crud`
4. backend `crud-proof`
5. `ngx-theme-apply` when the user gave a brand
6. one `ngx-page-create` per page (the entry page with `root:true`)
7. `mobile-builder-open(stateOnly=true, wait=true)`
8. `project-lint`
9. `browser-verify`, then its finishing pass (`design: true`) on the main pages
10. `project-save`

Do not present planner/specialist routing, benchmark flows, or manual YAML editing as the default path for that scope.

## Maintainer Rules

- Prefer MCP-native edits when changing MCP-managed objects.
- Convertigo project descriptors are MCP-owned. Never read or hand-edit `c8oProject.yaml`, `_c8oProject/**/*.yaml`, or `project.xml` as an authoring fallback. If the required MCP operation still fails after one targeted retry, stop and report the blocker without mutating project files.
- Keep tool names, titles, descriptions, and schemas aligned with the live behavior.
- Keep autodoc high-signal:
  - no boilerplate
  - no obvious restatement of parameter names
  - include only accepted formats, defaults, enums, side effects, and constraints that help the caller act correctly
- Keep public output fields in `lowerCamelCase`.
- Prefer typed envelopes with open payloads for dynamic inner objects.
- Treat RAG as slow fallback knowledge, not as the default onboarding path.

## Important Contract Decisions

- `databaseobject-tree-get` and `databaseobject-tree-apply` are the canonical authoring pair.
- The tree returned by `databaseobject-tree-get` must stay reusable by `databaseobject-tree-apply` without ad hoc translation.
- `requestable-execute` success payloads should expose `result` and optional `logs`. Failures must surface through the MCP error envelope.
- `rag-query` must not expose `stream`; backend calls must always force `stream=false`.
- Built-in resources such as `convertigo://capabilities` and `convertigo://recipes/quickstart` are part of the onboarding surface and must stay aligned with the live contract.
- `TOOLS.md` is generated from the live MCP catalog and is not a hand-maintained contract file.
- On a server whose C8Oforms gives each No Code user a Tigo key of their own (`APIV2_TigoUserKey` and
  `C8Oforms.tigo.server.id`, or seen since the engine started), the tools that start an agent outside the Agent Bridge
  (`subagent-run`, `browser-verify`) are refused whatever the bearer: `js/user_key_server_policy.js` removes them from
  the tool list, the router answers `agent_isolation_unavailable`, and `C8O.subagents.run` refuses to start. A tool
  added later that starts an agent goes into its `AGENT_TOOLS`. Test: `tests/scripts/validate_user_key_server_policy.cjs`.
- "Confirmer avant de modifier" and "Lecture seule" of a Studio's Tigo panel: the router holds every write of a managed
  token (Tigo's agents and their sub-agents) until the user answers a card, or refuses it in read-only mode
  (`js/studio_write_confirm.js`, the wait of `js/nocode_write_confirm.js`). Every `tools_*` sequence is in its
  `WRITE_TOOLS` or its `READ_TOOLS`: a tool added later goes into one of them, or
  `tests/scripts/validate_studio_write_confirm.cjs` fails. A batch is held for its writes only, and its `callsFile` is
  read before the card and run inline.

## Who owns the managed MCP url (contract with lib_ConvertigoAgentBridge)

`lib_ConvertigoAgentBridge` writes the managed Vibe `config.toml` and then calls
`_setupVibe` (through `installAgentSkills`), so this project always runs last on
that file. Both used to write the `url` of the same `[[mcp_servers]]` entry and
fought over it: the Bridge wrote an enriched url and `_setupVibe` rewrote it to
its own `?jsonOnly=true` form.

**The Bridge owns that url.** It marks the urls it owns with `from_bridge=true`:

```
http://<host>/convertigo/api/mcp?jsonOnly=false&from_bridge=true&descriptorVersion=<guidance>&toolsRevision=<hash>
```

- When `_setupVibe`, `_setupCodex` or `_setupClaude` finds an existing MCP server
  entry whose url carries `from_bridge=true`, it leaves that url untouched. It
  still repairs everything else it owns in the entry: `tool_timeout_sec` /
  `startup_timeout_sec`, `[mcp_servers.auth]`, the
  `X-Convertigo-Guidance-Version` header, the `[tools.*]` permissions.
- Without the marker, behaviour is unchanged: the url is rewritten, so a stale or
  hand-written entry is still repaired and an older Bridge keeps working.
- `replaceConfig=true` still rebuilds the whole file from scratch — that is an
  explicit "reset this home" request, not a repair, and the marker does not
  apply to it. The Bridge always calls with `replaceConfig=false`.
- The marker is inert server side: `mcp_endpoint` reads `request`, `jsonOnly`
  and, as a header fallback, `descriptorVersion`; the `/api/mcp` URL mapper maps
  `request` and `jsonOnly` only and ignores unknown query parameters.
- Implemented by `isBridgeOwnedMcpUrl` in `js/setup_vibe.js` and
  `js/setup_codex.js`, and by the `keepUrl` check in `js/setup_claude.js`.
  Deliberately duplicated rather than shared through `js/setup_common.js`, which
  is a guidance fingerprint source (`js/guidance_version.js`): touching it would
  change `C8O.MCP_GUIDANCE_VERSION` for an internal refactor.
- Covered by `tests/scripts/validate_setup_vibe_config.js` (marker honoured, and
  the no-marker path still repairs).

## X-Convertigo-No-Log in the client configurations

Since Convertigo 8.4.6, `MdcFilter` mutes HTTP dispatch on all paths, including
`/api/mcp`, for a request carrying `X-Convertigo-No-Log: true` or
`?__nolog=true`. Older engines apply the header in the MCP sequence steps.
Application sequences and transactions run by requestable-execute, including
its before calls, use normal logging unless the target requests quiet execution.

- `_setupCodex`, `_setupClaude` and `_setupVibe` write the header on the
  `convertigo` server (not on `convertigo-flow`), with the Bridge's rule
  (`C8O.util.mcpNoLogEnabled`): the `mcpNoLog` variable, else the global symbol
  `agentbridge.mcp.nolog`, else `true`. `mcpNoLog=false` removes the header.
- A Bridge-owned entry (url with `from_bridge=true`) keeps the header the Bridge
  chose: the Bridge has its own `mcpNoLog` option and calls the setups after
  writing its configuration.

## showExperimental on the MCP endpoint

`palette-list`, `palette-describe` and `databaseobject-schema` hide the
experimental features of the engine (JSON native steps, JSON native properties
of a sequence) while the engine switch `ExperimentalFeatures` is off. A client
whose endpoint URL has `?showExperimental=true` (for example
`http://localhost:18080/convertigo/api/mcp?showExperimental=true`), or that
sends the header `X-Convertigo-Show-Experimental: true`, sees them on every
request, whatever the switch.

- `js/mcp_endpoint_router.js` reads the URL or the header and passes the hidden
  variable `_showExperimental` to those three tools and to `batch-call`, which
  passes it on to its calls of those tools. It is not in their input schemas,
  and a value passed by the model is dropped.
- `C8O.dbo.isExperimentalShown` (`js/databaseobject.js`) returns true when
  `_showExperimental` is `true`. The palette property counts are cached apart
  (`#experimental` key suffix).
- Covered by `tests/scripts/validate_experimental_features.cjs`.

## X-Convertigo-Edit-Profile (edit profiles of a Tigo conversation)

lib_ConvertigoAgentBridge sends `X-Convertigo-Edit-Profile: yaml|html` on the MCP connection of a Studio Vibe conversation
switched with `/profil` (lib_ConvertigoAssistant `docs/edit-profiles.md`), for the A/B of the editing surfaces.
`js/edit_profile.js` reads it; without it (or with any other value) nothing changes: same tools, schemas, resources and
answers.
- `yaml`: `C8O.editProfile.YAML_REFUSED` (the writers of `js/subagents.js` WRITE_SEQUENCES but `project-reload` and
  `mobile-builder-build`, plus `project-delete`) is left out of `tools/list` (`mcp_tools_list.yaml`) and refused by the
  router, by `batch-call` for its inner calls, by `requestable-execute` of those sequences or of the Tigo projects, and for
  a constructor `subagent-run`. The agent edits the YAML files and calls `project-reload`
  (`resources/convertigo_yaml_editing.md`).
- `html`, only on an engine of 8.5.0 or more whose `NgxIonicRoundTripConverter` has the static
  `importIntoLoadedProject(String, String)` (`C8O.editProfile.htmlAvailable`, by reflection; elsewhere the html header is
  the default, and only a stale client sending `fromIonic` gets `unsupported`): `project-reload` takes
  `fromIonic`/`ionicTarget` and answers `ionicReport` (`js/ionic_roundtrip.js`); `mobile-builder-open`
  answers `ionicFiles`; tree-apply, delete, move and rename refuse a page whose generated files hold edits not imported
  (`resources/convertigo_ngx_html_roundtrip.md`). `js/schema_overrides.js` declares these fields in that profile only.
- The two guides carry `"profile"` in `resources/resources_index.json`: `resources/list` shows them in their profile only,
  `resources/read` serves them by uri in any, and the generic harness never copies them as skills.
Tests: `node --test tests/scripts/validate_edit_profile.cjs`.

## Vibe's MCP session per tool call (handshake and tools/list cost)

Vibe 3 (Unified Harness) pools stdio MCP servers only: for an HTTP server it opens a session for each tool call
(`initialize`, `notifications/initialized`, `tools/call`), and the MCP Python SDK of that session sends a `tools/list`
after a call that worked, to read the tool's output schema. The endpoint stays stateless (no `Mcp-Session-Id`: with
one, each of those sessions would also open a GET stream and send a DELETE), and makes the repeated parts cheap:
- `js/mcp_tools_list_cache.js`: the answer of an identical `tools/list` (same credentials, `X-Convertigo-*` headers,
  User-Agent, protocol version, query string, paging, token kind/scope/user, loaded lib_ConvertigoMCP) is kept 60 s in
  the server store; `ToolsListCachedInline` answers it without `internal_call`, `KeepToolsList` keeps a built one. The
  answer says `X-Convertigo-Tools-List-Cache: hit|miss`. A tool comment, schema override or policy symbol changed in a
  running engine shows in `tools/list` at most 60 s later (a project reload shows at once).
- `js/mcp_auth.js` `authenticateRequest(context, body)`: one check of the bearer per HTTP request (kept on the request
  for the sequences it calls, such as the feedback consent of `js/reporting.js`), and a handshake (`initialize`,
  `notifications/*`, `ping`) of a token that authenticated less than 30 s ago reuses that check. A `tools/call` or
  `tools/list` is always checked in full.
Tests: `node --test tests/scripts/validate_tools_list_cache.cjs tests/scripts/validate_handshake_auth.cjs`.

## Long tool answers in pages (answer-page)

Vibe 3.1 sets aside a tool answer over 16,000 characters and shows its model about 8,000 of it; it weighs what a
`run_typescript` script returns as JSON indented by 2 (each set-aside file is exactly its indent=2 size), and a No Code
agent cannot read the file it saves. `js/mcp_answer_pages.js` bounds every tool answer:
- `BoundAnswer` of `mcp_endpoint` (after the notes of the call, before the result is built) measures the answer as the
  client gets it: its text content, and its structured content indented by 2, notes and guidance warning included. Over
  `BUDGET` (14,000), the answer's JSON text is kept in `context.server` (`lib_ConvertigoMCP.answerPages`) under a random
  id bound to a digest of the bearer, 10 minutes, 32 answers and 8 M characters at most, 2 M per answer; the call
  answers its first page `{partialAnswer: {tool, answerId, page, pages, chars, howTo, next, text}}` (`PartialAnswer`).
  Pages stay under `PAGE_ROOM` (12,500, escaping counted) and cut after a comma between values when they can; the texts
  of pages 1 to `pages` joined are the answer's JSON. Without the store, or past 2 M, the first page only (`kept:false`).
- `answer-page {answerId, page}` (read, `tools_answer_page`) gives the others to the same bearer. Every output schema
  declares `partialAnswer` with typed fields (`decorateOutput`): the MCP client of Vibe checks a structured answer
  against its tool's schema, and an empty sub-schema in a schema dropped the whole connector (0.3.0-beta.33).
- A No Code token and the No Code profile call it too (`C8O.nocodeToolPolicy.SHARED_TOOLS`: the router, `mcp_tools_list`).
- Tools page their own big answers where natural, under the budget: `nocode-form-contract-get` (sections in parts
  `section.part`, `remaining` for what does not fit, `includeAllTypes` with `page`), `log-view`, `databaseobject-tree-get`
  and `batch-call` (page caps on the indented size).
Tests: `node --test tests/scripts/validate_answer_pages.cjs`.

## project-brief, project-notes-write and viewer-sign-in (an existing project from the first step)

Measured on SalesPipeline in the A/B harness of the Electron Studio (16/11, MCP 0.3.0-beta.28): a one-column change took
15 min with 8 s of editing and 6.2 min of exploring (52 reading calls), a KPI restyle 30 min with 16 s of editing, and
20 of those minutes went into guessing the demo password. Three tools answer what the agent was looking for:
- `project-brief` (`js/project_brief.js`, read): computed from the loaded project at each call (0.1 to 0.4 s, so never
  stale): pages (route segment, sequences called, pages opened, main components), sequences with their access lists and
  session change (`js/security_audit_collect.js`, `accessSummary`, `sessionChange`), SQL tables and fields (JDBC
  metadata), roles (literals of the role checks), references used, the style index (each class the pages use, where it
  is defined, `mainAppStyle`, `undefinedClasses`, pages without a style) and the project notes, secrets masked. With
  `page`: one line per object of that page with its QName suffix (built from `C8O.dbo.getCanonicalPropertiesMap`, the
  view of tree-get), and the CSS rules of its classes. Generic: nothing in it knows a generated app; checked on
  SalesPipeline, PipelineCrm3, TaskFlow and MiniCrm.
- `project-notes-write` (write, not in `YAML_REFUSED`): `<project>/_private/docs/PROGRESS.md`, `replace` or `append`;
  a text holding a password, token or key is refused (`checkNotesText`). `_private/` is never served (the engine
  answers 403) and stays out of the CAR; `docs/` is served as static files, so notes left in
  `docs/generated/PROGRESS.md` (up to 0.3.0-beta.30) are read as a fallback, flagged `legacy`, and moved by the next
  write, which deletes the old file (`planNotesWrite`; an appended legacy text moves masked). `project-brief` lists the
  text files of `docs/` and `docs/generated/` as `servedDocs`. Generated projects git-ignore `/_private/`: the notes
  stay in the Studio workspace. The Agent Bridge puts those notes at the start of
  each Studio turn about the project (`withProjectNotesPrompt`).
- `viewer-sign-in` (read, local Studio only, full bearer): a one-time ticket (32 random bytes, 60 s, single use, in
  `context.server`) that `node/viewer_session.cjs` makes the viewer page POST to the Hidden sequence
  `viewer_session_claim` in its own HTTP session, which calls `context.setAuthenticatedUser`; the app's AuthorizePages
  guard reads `user.Get`, so the pages behind the sign-in open. No password anywhere, no account written. The app's own
  sign-in sequence does not run: what it stores besides the user is not set (the answer says when the page still asks to
  sign in). `browser-verify` takes `signInAs` and does the same before its walk.
The guides forbid guessing, cracking or resetting a password (common skill, Validation and evidence; authentication
guide). Tests: `tests/scripts/validate_project_brief.cjs`, `tests/scripts/validate_viewer_session.cjs`.

## seed-proof (a seed proven replayable in one call)

An agent made its demo seed Public "so that a fresh server initializes itself", quieted `SEC-ANONYMOUS-WRITE` with a
`public-write` line, and reported the seed replayable from a second run that answered `status: error` (the counts were
unchanged because nothing ran). Two changes answer it:
- `seed-proof` (`js/tools_seed_proof.js`, read like `crud-proof`: application data only, never the project): counts the
  tables the seed writes (`SELECT COUNT(*)` on the read-only connection of `js/tools_sql_select.js`), runs the seed through
  the `tools_requestable_execute` sequence (an internal request with its own context, as crud-proof runs requestables),
  counts, runs it again, counts. `verdict` `replayable` only when both runs answered ok and run 2 left every count as run 1
  left it; `freshRun` when every counted table was empty before run 1. Default tables: the ones the SQL transactions the
  seed reaches (security audit model, `writesReachedFrom`) insert into, update, merge into or delete from; CouchDB,
  FullSync, HTTP and account writes go to `notCounted`. It never passes `allowDataReset`, and does not run a seed whose SQL
  empties or drops a table holding rows. Answer bounded under the paging budget (indented by 2).
- `project-lint`: a `public-write: <reason>` line no longer turns `SEC-ANONYMOUS-WRITE` (nor `SEC-CLIENT-TRANSACTION`)
  into a warning on a requestable without input variable (`numberOfVariables() == 0`): a visitor has nothing to send it,
  so it is a job, a seed or an init. `anonymousWrites` and `transactionFindings` take an optional `inputsOf(qname)`.
The seed guide (`convertigo://guides/common/seed`) defines the replay proof and the fresh-server proof. Tests:
`tests/scripts/validate_seed_proof.cjs`, `tests/scripts/validate_lint_anonymous_write.cjs`.

## project-changes (the journal of the writes of a conversation)

Agents closed tasks with "nothing else was modified" after changing existing objects nobody asked for, and "seed
verified" after the seed's last run answered an error. `js/write_journal.js` keeps, in `context.server`, what each
write tool of `C8O.studioWriteConfirm.WRITE_TOOLS` created, changed, renamed, moved or deleted, read from its answer
(`journalAfterToolCall` of the router, in the `RevealAfterCall` step of `mcp_endpoint`, after the reveal), and the runs
of `requestable-execute` (ok or in error). batch-call records each of its writes itself (`journalInnerCall`): its
compact answer keeps only a slot for a clean mutation; the endpoint records nothing for batch-call. A compact
tree-apply answer names the parent of what it created (its touched roots): the engine gives the child of that name.
- Key: a digest of `X-Convertigo-Conversation-Id`, else of the bearer. Bounded: 400 entries, 160,000 characters per
  journal, 64 journals, 24 h. QNames, tool names and statuses only, never an argument value.
- `project-changes` (read) answers one line per object (final state, tools and counts, times), the files, the runs and
  the projects, under 12,500 characters (what is left out is counted), with `howToUse`; `project` and `since` narrow it.
- Error answers, reads and calls that threw record nothing. A write tool without a handler of its own is read by the
  generic one (`created`, `updated`, `deleted`, `qname`). Tests: `tests/scripts/validate_project_changes.cjs`.
- Proofs: the journal also records `crud-proof`, `seed-proof` and the verifier reports of `browser-verify` and
  `subagent-run` (`api.PROOF_TOOLS`, read tools let through by `journalAfterToolCall`), ok or not, with their project.
  `api.proofState` computes the objects changed and not proven since their last change (backend by a run of their
  sequence or transaction, UI by a passed verifier report, files by any run of their project); `project-changes`
  answers them in `unproven`, and after every append for a conversation the state goes to `context.server` under
  `lib_ConvertigoMCP.proofState` for the Agent Bridge: the contract is `docs/proof-state-contract.md`. Tests:
  `tests/scripts/validate_proof_ledger.cjs`.

## The No Code skill: SKILL.md and its drawers (contract with lib_ConvertigoAgentBridge)

Vibe saves a tool answer over about 16,000 characters to a file and shows the model its first and last 4,000 or so,
and a No Code agent reads no MCP resource (nocode-* tools only). So `resources/convertigo-nocode/` is a summary and
drawer files, installed together in the agent's skill folder:
- `SKILL.md` keeps the rules of every turn (bootstrap, authentication, tool boundary, publishing, confirmations,
  feedback, refusal) and a `## Drawers` section: how to read a drawer, and the tool order. Each line
  ``> Drawer `<file>.md` — <title>: read it <when>.`` names a drawer of the same folder and stands where its text
  belongs.
- A drawer is `# <title>`, the same `Read it <when>.` line, then `---` and its text. New rules go to the drawer of their
  step; SKILL.md stays under 15,000 characters as installed, a drawer under 12,000.
- `_setupCodex` and the other setups that install the skill write SKILL.md and every drawer it names, and remove the
  other `.md` files an older install left in the folder (`writeNoCodeSkillDrawers`). The Bridge copies the same folder
  for its other homes, keeps a drawer only while the installed SKILL.md names it, and lets a confined Vibe `read_file`
  the folder.
Tests: `tests/scripts/validate_nocode_skill_drawers.cjs` (sizes, installs, the drawers put back in place give the
whole text once: its fingerprint changes with any change of the skill text). The content tests read that whole text
through `tests/helpers/nocode_skill.cjs`.

A client outside Tigo (an agent with no skill, or one of another guidance version) gets the same files from the MCP
itself, rendered by `js/skill_package.js` (part of the guidance fingerprint):
- the `initialize` instructions (`js/server_instructions.js`) are a short bootstrap: for a No Code token, call
  `skill-install` when `convertigo-nocode` is missing or its `Skill guidance version` differs, plus the rules that hold
  before the skill is read; any other token keeps the engine sentence and gets the same check;
- `skill-install` answers SKILL.md to apply at once and every file with its bytes and sha256 to write in the skill
  folder of the harness, the obsolete files and `up_to_date`; `file`, `all` (answer pages) and `plan`. It writes
  nothing and answers plain skill files only. Its files equal what `_setupCodex`/`_setupClaude` install;
- the resources `convertigo://skills/convertigo-nocode` (SKILL.md for any client) and `.../<drawer>`;
- the stale notice of a No Code write and `convertigo://capabilities` point to them.
Tests: `tests/scripts/validate_skill_install.cjs`.

## Files That Matter Most

- `_c8oProject/sequences/mcp_endpoint.yaml`
  - JSON-RPC entry point and response shaping
- `_c8oProject/sequences/internal_list_tools_info.yaml`
  - tool discovery for `tools/list`
- `_c8oProject/sequences/internal_json_schema.yaml`
  - schema generation
- `_c8oProject/sequences/tools_*.yaml`
  - public tool implementations
- `js/schema_overrides.js`
  - input/output schema overrides
- `js/tools_batch_call.js`
- `js/tools_databaseobject_tree_apply.js`
- `review/`
  - contract snapshots, mismatch matrix, scorecards, roadmap

## Documentation Policy

- English only.
- The live MCP catalog is the primary contract surface.
- `TOOLS.md` is a short generated human companion, not the source of truth.
- Public onboarding should bias toward the mono-agent CRUD fast path when it matches the task.
- `project.md` is generated output and may lag or include internal details; do not use it as the authoritative contract for prompts or guides.
- Runtime field feedback files are build artifacts under `feedback/inbox/` and must not be committed.
- Raw field feedback must be consolidated under `feedback/triage/` before it is used as maintainer input.
- Guide strategy is tracked in `REVIEW-ROADMAP.md`.

## Validation Checklist

After changing the MCP:

1. Check `initialize`
   - protocol version, server info, capabilities
2. Check `tools/list`
   - titles and descriptions are non-empty
   - input/output schemas match runtime behavior
3. Check core tools with live calls
   - `batch-call`
   - `databaseobject-tree-get`
   - `databaseobject-tree-apply`
   - `log-view`
   - `requestable-execute`
   - `mobile-builder-open` when safe
4. Check error routing
   - invalid tool input should become MCP `error`
   - tool-specific partial/validation states should stay in structured payloads when that is the chosen contract
5. Refresh the generated maintainer docs and any review artifacts when the contract changes.
