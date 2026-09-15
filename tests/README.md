# Codex CLI prompts (`codex_test`)

This folder stores reproducible prompts/scripts for running Codex CLI scenarios locally. Raw logs stay in `tests/logs`, derived reports in `tests/reports`, and work files in `tests/workspace` (all ignored by Git).

This entire folder is an internal lab surface for benchmark and observability work. It is not the recommended public MCP onboarding path during the mono-agent CRUD recovery cycle.

## No-code generation quality

Label regression cases check the content actually selected by the Forms
question renderer (`personalized ? html : label`), not just the presence of
`config.label`. They cover all question prototypes, contextual/disabled inputs,
plain-text escaping, intact SmartSource envelopes, explicit rich text/mode
precedence and semantic edits of existing labels. Prototype question diagnostics
are advisory so existing drafts remain editable.

Context defaults are documented by `authoringContract.contextualDefaults`.
`defaultFrom` compiles to an editable native TS self source and the opt-in
`config.contextValueMode`. Deploy the C8Oforms viewer update with this MCP
change: an older viewer ignores the initial-only policy. Existing native
sources without the new policy are unchanged. Only scalar controls accept the
shorthand; choice defaults and backend data views retain their own contracts.
Initial defaults require the source value to be ready when the page initializes;
they deliberately do not subscribe to late changes. Clock defaults use the
browser clock, and runtime identity is not a server-side access-control check.

Run `node --test tests/scripts/validate_nocode_generation.cjs`. The tests use the
actual Forms `AllTypes.json` in the sibling `C8oForms` checkout (override with
`C8OFORMS_PROJECT_ROOT`) and mock only the Java filesystem/engine adapter. They
cover message mapping, styles (including nested layout children), responsive
action groups, visible flow names, navigation/grid references, Baserow binding
configuration, invalid generation, legacy draft compatibility, nested flow
links and post-save readback. Baserow compiler cases use in-memory test identities;
they neither write records nor prove backend persistence. Creation lifecycle
tests now exercise the public create/edit functions and the complete save/read/
finalize/read cycle using an in-memory requestable transport. They cover server-
assigned component ids, trusted creator identity, readback failures, second-save
failure, same-id recovery, idempotency and intervening edits.

`fixtures/nocode-generation-quality.json` is a legacy transient-grid regression
fixture, not an application template or a delivery-quality benchmark. Keep it
for compiler compatibility tests only; do not create it as a replacement for a
requested application. Its stable input id makes the SmartSource test reproducible
and must not be copied into unrelated generated applications.

The earlier 2026-09-11 browser pass only verified transient component behavior,
including a 390px viewport. It did not verify application delivery or persistence.
The operational acceptance test must use an authorized Baserow destination:
create the dedicated schema, connect save and read to the same table, submit an
authorized test record, reload, and verify the record in the result view. Check
flow labels, grouped buttons and spacing on desktop/mobile, and report the test
record's disposition. If authentication or destination is unavailable, mark this
acceptance test pending rather than replacing it with local rows.

New compile/create rejects incomplete action flows. Full-document validation
keeps these as warnings for existing drafts; structural reference errors stay
blocking. Successful saves now re-read the authoritative document and return
`readbackVerified`. If readback fails, the write is still successful: re-read its
returned id rather than retrying create. No Studio viewer behavior is changed.

Baserow creation manages `form_id`, `source_id` and `source_owner`: callers must
omit them in new reduced input. `bindingFinalization.status=pending_creation`
at compile is nonblocking. Create reports `ready` only after identity readback;
it does not execute business actions. After a partial result with `saved:true`,
use the returned `nocode-form-edit` recovery (`finalize_baserow_bindings`, alone)
on the existing id. It is creator-only and preserves other source owners by
refusing a takeover. Existing-document writes now carry the revision read to
`C8Oforms.APIV2_updateFormulaireDocument`. Its opt-in `form_write_guard.js` path
keeps that revision for the native CouchDB write (`policy=none`), rejects stale
or missing documents, and preserves attachment stubs. Ordinary editor calls
without the guard retain their previous merge behavior. Deploy these Forms and
MCP changes together; an older Forms API does not enforce this guard. The two
creation writes still are not one transaction.
Only the first write uploads a requested thumbnail. No Baserow rows are written
by finalization. A live authenticated create and data round-trip remain separate
acceptance checks from the in-memory suite.

Semantic edits also finalize new/changed Baserow bindings before the edit save,
preserving existing connection owners. Added pages inherit navigation, including
custom mode. Regression cases cover a race after the revision preflight,
concurrent deletion, edit-time identity binding, readback mismatch, invalid row
ids/value mappings, actual column-name matching (with a simulated catalog), and
missing spacing in nested layouts. The in-memory server
uses the actual Forms write guard and simulates CouchDB revision rejection; it
does not substitute for a live concurrency/ACL acceptance check.

Exception: `scripts/run_fastpath_repeatability.py` is the dedicated repeatability runner for the recommended mono-agent CRUD fast path. It still lives under `tests/`, but it is intentionally separate from the benchmark/multi-agent lab flow.

- `prompt.txt`: Main end-to-end HTTP contract scenario. The runner should inject `convertigo-http`.
- `prompt_analyze_sentence.txt`: Backend sequence scenario. The runner should inject `convertigo-backend`.
- `prompt_facade_stub_probe.txt`: Planner probe. The runner should inject `convertigo-planner`.
- `prompt_http_facade_probe.txt`: HTTP-behind-facade probe. The runner should inject `convertigo-http`.
- `prompt_ngx_contract_probe.txt`: NGX probe. The runner should inject `convertigo-frontend-ngx`.
- `prompt_recovery_invalid_target.txt`: Recovery probe for invalid target assumptions. The runner should inject `convertigo-backend`.
- `prompt_sql_facade_probe.txt`: PostgreSQL-backed SQL facade probe. The runner should inject `convertigo-sql`.
- `prompt_uistyle_stylecontent.txt`: UI regression scenario. The agent must fetch `convertigo-frontend-ngx`.
- `prompt_critic_review.txt`: Legacy critic review of the latest prior probe log. Kept for history only.
- `prompt_critic_run_review.txt`: Critic review of one explicit benchmark run. The runner should inject `convertigo-critic`.
- `prompt_critic_aggregate_review.txt`: Critic review of one explicit benchmark campaign. The runner should inject `convertigo-critic`.
- `prompt_maintainer_cycle.txt`: Maintainer-cycle template that injects one maintainer packet and requires one committed candidate. The runner should inject `convertigo-maintainer`.
- `prompt_crud_fastpath_repeatability.txt`: Generic mono-agent CRUD repeatability prompt template. The dedicated runner renders `__TARGET_PROJECT__` and `__CRUD_SPEC_JSON__`, then injects `convertigo-crud-fastpath`. The rail is now `marketplace-import -> mobile-builder-open -> upsert-crud -> backend proof -> upsert-ngx-crud-kit stage=bootstrap -> mobile-builder-open -> upsert-ngx-crud-kit stage=final -> final proof`.
- `scripts/validate_setup_codex.py`: Validates the private Studio `_setupCodex` sequence against temporary Codex homes. It checks skill generation, minimal `config.toml` patching, and idempotence.
- `scripts/validate_setup_vibe.py`: Validates the private Studio `_setupVibe` sequence against temporary Vibe homes. It checks isolated skill generation, `AGENTS.md`, deterministic `config.toml`, patch mode, and idempotence.
- `prompt_crud_fastpath_fresh_session.txt`: Minimal empty-workspace CRM brief used to verify that the injected `convertigo-crud-fastpath` role prompt still drives discovery before mutation.
- `scripts/validate_mobile_builder_compile_error.py`: Deliberately injects a broken page script through MCP and verifies that `mobile-builder-open` returns `compile_error` plus structured compile diagnostics without waiting for a blind timeout.
- `scripts/validate_nested_xmlvector.js`: Verifies that XMLVector properties preserve nested rows such as NGX application package dependencies and TypeScript imports while flat SmartType source vectors remain unchanged.
- `scripts/validate_crud_name_overrides.py`: Verifies `singular` / `plural` / `routeSegment` / `displayLabel` overrides on the generic CRUD fast path.
- `bin/codex`: Wrapper used by default by `run_prompt.sh`. It pins the npm package version in one place through `CODEX_NPM_VERSION` (default `0.111.0`) and avoids depending on the machine-wide `codex`.
- `run_prompt.sh`: Helper to run Codex CLI from the repository root (`bash tests/run_prompt.sh [prompt_file] [run_label] [role_prompt_name]`). When the third argument is set, the script fetches the role prompt from MCP first and injects it into the Codex run.
- `scripts/report_codex_run.py`: Converts one raw Codex CLI log into `report.json` plus `summary.md`.
- `scripts/run_fastpath_repeatability.py`: Dedicated sequential campaign runner for the mono-agent CRUD fast path. By default it runs `3 x HSQLDB`, `3 x PostgreSQL`, and `3 x MariaDB` through `codex exec`.
- `scripts/validate_fresh_session_fastpath.py`: Runs one `codex exec` from an empty workspace, then parses `raw.log` plus the Codex session trace to assert the discovery order, the `marketplace-import -> viewer -> CRUD` flow, the absence of generated-artifact repair attempts, and the final `crud-proof(viewerUrl)`.
- `scripts/run_campaign.py`: Runs one benchmark campaign for a frozen MCP candidate.
- `scripts/score_campaign.py`: Scores one benchmark campaign and writes aggregate findings.
- `scripts/compare_campaigns.py`: Compares a baseline campaign aggregate against a replayed candidate campaign and emits a verdict.
- `scripts/run_improvement_cycle.py`: Builds one maintainer packet, opens one candidate worktree/branch, runs one maintainer candidate, replays the benchmark slice, and writes the comparison verdict.
- `benchmarks/suites/phase4_v1.json`: Tracked benchmark suite manifest for Phase 4.
- `fixtures/sql/postgres-v1/`: PostgreSQL fixture used by the SQL benchmark scenario.

All prompts are written in English and stay scenario-specific. The benchmark runner is responsible for injecting the matching MCP role prompt and, for mutating campaign scenarios, for importing the target benchmark project first. Scenario files must not duplicate role-bootstrap logic or dynamic workspace project-selection logic. Probe prompts must end with concrete pass/fail or skip evidence plus one short MCP critique item.

Runtime artifact layout:

- Raw log: `tests/logs/<runId>.log`
- JSON report: `tests/reports/<runId>/report.json`
- Markdown summary: `tests/reports/<runId>/summary.md`

The runner prints all three paths at the end of each run. Reports are derived artifacts, not tracked repository content.

By default, test runs use `tests/bin/codex`, which wraps `npx -y @openai/codex@<version>`. To try another npm version without editing the runner:

```bash
CODEX_NPM_VERSION=0.112.0 bash tests/run_prompt.sh tests/prompt_facade_stub_probe.txt planner_smoke convertigo-planner
```

Campaign artifact layout:

- Campaign root: `tests/campaigns/<candidateId>/`
- Campaign manifest: `tests/campaigns/<candidateId>/manifest.json`
- Scenario runs: `tests/campaigns/<candidateId>/runs/<scenarioId>/<runId>/`
- Run critics: `tests/campaigns/<candidateId>/critics/<scenarioId>/<runId>/`
- Aggregate output: `tests/campaigns/<candidateId>/aggregate/`
- Isolated workspaces: `tests/campaigns/<candidateId>/workspaces/<scenarioId>/<workspaceId>/`
- SQL fixture runtime metadata: `tests/campaigns/<candidateId>/fixtures/sql/<runId>/`

Fast-path repeatability artifact layout:

- Campaign root: `tests/reports/fastpath-repeatability/<timestamp>/`
- Rendered prompts: `tests/reports/fastpath-repeatability/<timestamp>/prompts/`
- Per-run Codex artifacts: `tests/reports/fastpath-repeatability/<timestamp>/runs/<runId>/`
- Per-run workspaces: `tests/reports/fastpath-repeatability/<timestamp>/workspaces/<runLabel>/`
- Aggregate JSON summary: `tests/reports/fastpath-repeatability/<timestamp>/summary.json`
- Aggregate Markdown summary: `tests/reports/fastpath-repeatability/<timestamp>/summary.md`

Phase 4 benchmark campaigns are file-first and sequential by default, but their layout is parallel-safe. Critic prompts must target explicit report paths, never the latest log.

For Phase 4.1 and later, mutating benchmark scenarios are fixture-driven:

- the runner imports `template_ngxBuilderIonic` under a unique `BenchAI_*` project name per run
- the scenario prompt receives that exact target project name
- the scenario may mutate only that owned project
- before each campaign, the runner deletes any loaded `BenchAI_*` projects visible to the engine so the suite starts from a clean benchmark workspace
- after each run, owned benchmark project retention is controlled by `CAMPAIGN_AFTER_RUN_CLEANUP_MODE`:
  - `on`: delete the owned project immediately
  - `off`: keep all owned projects from the campaign for inspection
  - `keep-last` (default): retain the owned project for inspection and let the next campaign's preflight cleanup clear stale loaded `BenchAI_*` projects

Improvement-cycle artifact layout:

- Cycle root: `tests/improvement/<baselineCandidateId>/<cycleId>/`
- Cycle manifest: `tests/improvement/<baselineCandidateId>/<cycleId>/manifest.json`
- Maintainer packet: `tests/improvement/<baselineCandidateId>/<cycleId>/maintainer/packet.json`
- Maintainer prompt: `tests/improvement/<baselineCandidateId>/<cycleId>/maintainer/prompt.txt`
- Maintainer run artifacts: `tests/improvement/<baselineCandidateId>/<cycleId>/maintainer/run/`
- Candidate metadata: `tests/improvement/<baselineCandidateId>/<cycleId>/candidate/metadata.json`
- Replay campaign root: `tests/improvement/<baselineCandidateId>/<cycleId>/replay/<candidateId>/`
- Comparison output: `tests/improvement/<baselineCandidateId>/<cycleId>/compare/`

The improvement loop assumes that the provided MCP URL targets the candidate runtime you want to mutate and replay. The default local Studio target is useful for scaffolding and packet generation, but isolated live cycles need a candidate-aware Convertigo runtime.

The improvement orchestrator also refuses to start from a dirty repository. Commit or stash local changes before opening a cycle so the candidate branch starts from a clean baseline SHA.

Run one campaign:

```bash
python3 tests/scripts/run_campaign.py \
  --suite tests/benchmarks/suites/phase4_v1.json
```

Run the mono-agent CRUD repeatability campaign:

```bash
python3 tests/scripts/run_fastpath_repeatability.py
```

Run one improvement cycle from an existing scored campaign:

```bash
python3 tests/scripts/run_improvement_cycle.py \
  --baseline-campaign-dir tests/campaigns/<candidateId>
```

Backfill an old log manually:

```bash
python3 tests/scripts/report_codex_run.py \
  --log tests/logs/phase2_planner_latest_20260306_215906.log \
  --out-dir tests/reports/phase2_planner_latest_20260306_215906
```

Backfill the full Phase 2 sample set:

```bash
for stem in \
  phase2_planner_latest_20260306_215906 \
  phase2_http_latest_20260306_220015 \
  phase2_frontend_validate_20260306_220753 \
  phase2_critic_latest_20260306_221009 \
  phase2_backend_latest_20260306_221009
do
  python3 tests/scripts/report_codex_run.py \
    --log "tests/logs/${stem}.log" \
    --out-dir "tests/reports/${stem}"
done
```
