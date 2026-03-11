# Review Roadmap

## Purpose

Build the improvement factory around Convertigo MCP:

- one reliable onboarding path for LLMs
- role-specific guidance for specialized agents
- structured feedback loops
- repeatable benchmarks
- automated improvement cycles
- future portability across providers and deployment environments

## Current Observations

- The repository already has MCP resources, prompts, tools, and prompt-based tests.
- The reviewed documentation, prompt, and tests are now aligned with the currently exported tree-first tool surface.
- The remaining work has moved from contract correction to guide consolidation, benchmark design, and role specialization.
- Before optimizing agents further, the project still needs a stricter layering between real tools, onboarding assets, and benchmarks.
- The live MCP server now exposes a reviewed contract whose tool metadata and public schemas are consistent enough to serve as the Phase 0 truth set.
- Colleague projects already contain useful patterns for role decomposition, validation gates, and delivery discipline.
- The current guide set is still too shallow to encode real Convertigo know-how at POC speed.
- Benchmarks can now validate behavior, but they are not enough to synthesize platform expertise by themselves.
- The next acceleration depends on knowledge ingestion from `convertigo-doc`, RAG, and curated example patterns.

## Evidence Sources

The review work must rely on three input families:

1. Existing documentation in this repository.
2. External companion projects already exploring multi-agent orchestration and skill-driven editing.
3. The live MCP signature exposed by the current server.

Evidence priority order:

1. live MCP signature and behavior
2. current repository implementation and exported schemas
3. current repository documentation and prompts
4. colleague repositories and experiments

Rationale:

- live signature wins for "what exists now"
- repository code wins for "how it is implemented"
- repository docs win for "what we intended to teach"
- colleague projects win for reusable patterns, not for authoritative contract truth

## Guiding Principles

- English only for every user-facing and machine-facing document.
- One canonical starting guide, not three overlapping introductions.
- Specialized guides must extend the starting guide, not duplicate it.
- Tool contract truth comes before prompt quality.
- Tool self-documentation matters as much as external guides.
- Tool self-documentation must stay high-signal: no boilerplate, no obvious restatements, only usage-helping constraints and semantics.
- Benchmarks come before large-scale automation.
- Feedback must be structured enough to be compared across runs.
- Warnings should teach the model what to read next instead of failing silently.
- RAG is a slow fallback for missing knowledge, not the default path for routine work.
- Benchmarks validate recipes and handbooks; they do not replace them.

## In Progress - Knowledge-First Recovery Sprint

Goal: move from bench-first discovery to knowledge-first execution.

Current direction:

- add one big-picture Convertigo platform guide so the model understands what it is manipulating
- add prescriptive golden-path recipes for the fastest common outcomes
- keep deep handbooks for domain subtleties instead of overloading bootstrap prompts
- add a tracked `knowledge/` workflow so future explorer agents can propose evidence without colliding on edits

First-wave deliverables:

- `convertigo-platform-big-picture`
- `convertigo-recipe-facade-stub`
- `convertigo-recipe-http-facade`
- `convertigo-recipe-sql-crud`
- `convertigo-recipe-ngx-data-page`
- `convertigo-recipe-starter-extension`

Expected effect:

- fewer exploratory tool calls before the first correct write
- faster planner decisions
- more reuse of known Convertigo patterns
- more visible POC speed-up before deeper automation improvements

Near-term backlog recorded by this sprint:

- Gradle/build/mobile/CI knowledge and later MCP helpers
- generic non-YAML project file tooling
- deeper expert handbooks for FullSync/CouchDB, Baserow, URL mapper, global symbols, marketplace libraries, and platform admin

## [DONE] Preparation Phase - Evidence Baseline

Goal: prepare a clean review baseline before Phase 0 starts.

Status:

- completed in `review/live-contract/`, `review/mismatch/`, `review/glossary/`, and `review/patterns/`
- baseline captured from live MCP `0.0.6`
- colleague repositories reviewed as pattern sources

Scope:

- collect and snapshot the living MCP contract
- collect the current guide and prompt corpus
- extract reusable patterns from colleague projects
- define the review method and evidence ranking

Mandatory inputs:

- this repository documentation, prompts, tests, and tool descriptors
- `/Users/nicolas/git/codex-cli-multiagent`
- `/Users/nicolas/git/convertigo-project-editor`
- live MCP calls to `initialize`, `tools/list`, `resources/list`, `resources/read`, and `prompts/list`

What to capture:

- current MCP server info and version
- full list of live tools with names, titles, descriptions, input schemas, and output schemas
- full list of live resources and prompts
- current quickstart and capability resources actually served by the MCP
- explicit deltas between live contract and local documents
- reusable patterns from colleague work:
  - role decomposition
  - preflight gates
  - validation workflow
  - artifact and feedback discipline

Key findings already visible:

- the live server currently exposes `21` tools, `9` resources, and `1` prompt
- the live contract is centered on `databaseobject-tree-get` and `databaseobject-tree-apply`
- dynamic resources such as `convertigo://capabilities` and `convertigo://recipes/quickstart` already act as contract-oriented onboarding assets
- colleague work already demonstrates a planner-plus-specialists model and stricter validation gates

Preparation tasks:

- define the review checklist and the source-of-truth order
- capture a machine-readable baseline of the live MCP signature
- create a comparison matrix:
  - live signature vs repository docs
  - live signature vs repository prompts
  - live signature vs repository tests
  - reusable patterns from colleague repositories vs current MCP assets
- identify obsolete terms, removed tools, renamed flows, and missing onboarding pieces
- identify what should become:
  - canonical starting guide content
  - specialized guide content
  - tool metadata improvements
  - benchmark scenarios

Preparation deliverables:

- evidence inventory
- contract snapshot
- mismatch matrix
- glossary of canonical terms
- list of patterns worth importing from colleague projects
- shortlist of documents to retire, merge, rewrite, or keep

Exit criteria:

- the team agrees on what counts as source of truth for the next review cycle
- the live contract has been captured and can be compared deterministically
- obsolete documentation areas are identified before Phase 0 rewriting starts

## [DONE] Phase 0 - Contract and Self-Documentation Audit

Goal: establish a single source of truth for what the MCP actually exposes.

Status:

- completed in `review/phase0/`
- tool UX scorecard produced
- deprecation and replacement decisions recorded
- future guide metadata and warning specs recorded without changing the live API
- MCP auto-documentation rewritten for the live `21`-tool catalog and refreshed against server `0.0.7`
- review refreshed against live server `0.0.9`
- no open Phase 0 mismatch remains between the live contract and the current docs, prompt, and tracked tests
- the last `8` B-grade tools have been raised to A-grade with typed public input schemas

Deliverables:

- resolved review of all mismatches discovered during the Preparation Phase
- inventory of real MCP tools, prompts, resources, and tests
- gap list between exported tools and documented tools
- audit of tool names, descriptions, parameter names, parameter descriptions, and output clarity
- review of database object comments that feed `tools/list` auto-documentation
- decision log for deprecated, missing, and replacement capabilities
- updated canonical overview of the current contract
- list of MCP UX issues where better tool design can remove the need for extra documentation
- explicit decision on what belongs in tool metadata, in guides, in prompts, and in RAG-backed fallback material

Exit criteria:

- every documented tool exists, or is explicitly marked as planned
- every prompt references only valid resources and valid tools
- every benchmark scenario uses the current contract only
- the most common tools are understandable from their own MCP metadata without opening extra documentation
- the split between self-documenting MCP UX and external guide content is explicit and justified
- the auto-documentation style rules are explicit: no boilerplate, only non-obvious constraints, accepted formats, value domains, defaults, and side effects
- current status: satisfied on the reviewed live surface

## [DONE] Phase 0.5 - Core Output Contract Cleanup

Goal: make the core MCP outputs truthful, typed, and directly reusable.

Status:

- completed on live server `0.0.8`
- core tools no longer expose legacy `*Json` output fields
- output schemas for the core tools now match the live payload shape
- the tree round-trip rule has been validated with `databaseobject-tree-get` reused directly in `databaseobject-tree-apply` with `dryRun=true`

Scope completed:

- `batch-call`
- `databaseobject-tree-apply`
- `databaseobject-tree-get`
- `log-view`
- `requestable-execute`
- `mobile-builder-open`

Delivered changes:

- normalized public output keys to `lowerCamelCase`
- removed legacy flattened control-report fields from `batch-call` and `databaseobject-tree-apply`
- replaced opaque JSON-string subreports with typed nested objects and arrays
- added output schema overrides in the schema-generation layer
- aligned `databaseobject-tree-get` schema to the real `tree` / `forest` payload
- aligned `log-view`, `requestable-execute`, and `mobile-builder-open` schemas to their real runtime payloads
- bumped the project version to `0.0.8`

Validated outcomes:

- `tools/list` exports truthful output schemas for the six core tools
- `batch-call` no longer returns `summaryJson`, `reportJson`, `refsJson`, `operationsJson`, `errorsJson`, `saveResultsJson`, `mobileBuilderJson`, `touchedQNamesJson`, or `mutationFinalizeJson`
- `databaseobject-tree-apply` no longer returns `warningsJson`, `summaryJson`, `reportJson`, `refsJson`, `operationsJson`, `errorsJson`, `saveResultsJson`, `mobileBuilderJson`, or `touchedQNamesJson`
- `databaseobject-tree-get` now exports `tree` and `forest`, never `Tree` or `Forest`
- `requestable-execute` and `mobile-builder-open` no longer advertise a generic success-path `error` envelope

Remaining output-contract backlog after Phase 0.5:

- none on the current reviewed catalog surface

## [DONE] Phase 1 - Guide System

Goal: replace overlapping onboarding documents with a layered guide model.

Status:

- completed on live server `0.0.10`
- the public resource catalog now exposes versioned guide metadata through `resources/list`
- the old quickstart-era guide URIs have been removed from the public MCP catalog
- one neutral prompt now points to the new guide set without introducing specialist role prompts yet

Target model:

- one entry guide for all agents
- domain guides for backend, frontend NGX, integration, debugging, benchmarking
- stable guide identifiers and explicit revisions
- machine-readable metadata describing when a guide is required or recommended
- specialized warnings emitted by tools when the caller likely missed an important guide
- repeated RAG answers consolidated back into guides to reduce future RAG calls

Recommended guide identity format:

- `convertigo/start@1`
- `convertigo/backend-sequences@1`
- `convertigo/frontend-ngx@1`
- `convertigo/integration-http@1`
- `convertigo/benchmarking@1`

Guide metadata should contain:

- `id`
- `revision`
- `scopeTags`
- `prerequisites`
- `recommendedTools`
- `resourceUri`
- `promptNames`

Exit criteria:

- the starting guide is enough to begin safely
- specialized guides are short, scoped, and non-redundant
- tools can point to the right guide when the caller enters a specialized area
- guide warnings work as hints and remain stateless-compatible
- current status: satisfied for the guide catalog and public resource metadata; role prompts are now completed in Phase 2

## [DONE] Phase 2 - Prompt Roles

Goal: define reusable MCP prompts for agent roles without turning prompts into large manuals.

Status:

- completed on live server `0.0.11`
- `prompts/list` now exposes `7` file-backed prompts with machine-readable metadata
- `prompts/get` returns the same metadata plus the prompt body, so clients do not need a second lookup
- `resources/list` now exposes `18` resources and file-backed guides expose `promptNames`
- mandatory live Codex CLI probes passed with `codex-cli 0.111.0`:
  - `convertigo-planner`
  - `convertigo-http`
  - `convertigo-frontend-ngx`
- the `convertigo-critic` prompt completed a live review run and produced concrete findings on the latest backend sanity probe
- the backend sanity run was intentionally kept non-blocking; it exposed a real prompt/workflow weakness instead of producing a false green
- the SQL prompt is published and catalog-valid, but no live database-backed probe was run because no safe local SQL target was available

Delivered roles:

- `convertigo-quickstart`
- `convertigo-planner`
- `convertigo-backend`
- `convertigo-sql`
- `convertigo-http`
- `convertigo-frontend-ngx`
- `convertigo-critic`

Prompt rules:

- prompts tell the agent what to read first
- prompts define workflow and stopping rules
- prompts define expected output format
- prompts must stay thinner than the underlying guides
- prompts execute writes through MCP only
- mutating prompts end with `project-save` unless the task is explicitly dry-run or review-only
- every prompt requires one short `mcpCritique` line

Exit criteria:

- each role has a single clear responsibility
- prompts compose cleanly with the guide system
- prompts do not embed large duplicated knowledge blocks
- the three mandatory live probes pass
- the critic can review a real probe log and produce concrete findings
- current status: satisfied for role prompts and mandatory live validation; the backend sanity finding is tracked as non-blocking input for Phase 3

## [DONE] Phase 3 - Reporting

Goal: make agent feedback comparable and reusable.

Status:

- completed as a file-first reporting layer on top of `tests/run_prompt.sh`
- no scoring yet; benchmark policy remains out of scope
- raw logs remain the forensic source of truth
- each run now produces a structured JSON report and a short Markdown summary under `tests/reports/<runId>/`
- existing Phase 2 logs have been backfilled to prove `PASS` and `UNKNOWN` handling on real artifacts
- fresh artifact generation has been validated through the runner and parser pipeline; parser correctness is validated on real Phase 2 logs, while the local fresh smoke used a deterministic runner stub because interactive Codex CLI runs were unstable on this machine during the review pass

Required outputs per run:

- structured JSON report
- short Markdown summary for humans

Delivered reporting contract:

- `schemaVersion`
- `runId`
- `startedAt`
- `finishedAt`
- `provider`
- `model`
- `reasoningEffort`
- `requestTimeoutSec`
- `scenario`
- `rolePrompt`
- `guideContext`
- `mcpServer`
- `toolCalls`
- `toolStats`
- `warnings`
- `errors`
- `result`
- `durationMs`
- `finalOutput`
- `artifacts`

Delivered artifacts:

- schema: `review/schemas/run-report.schema.json`
- parser: `tests/scripts/report_codex_run.py`
- runner integration: `tests/run_prompt.sh`
- runtime output layout:
  - `tests/logs/<runId>.log`
  - `tests/reports/<runId>/report.json`
  - `tests/reports/<runId>/summary.md`

Validated outcomes:

- planner pass log backfilled as `PASS`
- HTTP pass log backfilled as `PASS`
- frontend validation log backfilled as `PASS`
- critic review log backfilled as `PASS`
- incomplete backend log backfilled as `UNKNOWN`
- a fresh `run_prompt.sh` execution now produces raw log, JSON report, and Markdown summary automatically
- the current `critic` scenario wording based on `latest log` is known to be unsafe for repeated runs and should be replaced by explicit run targeting in Phase 4

Exit criteria:

- every run produces a comparable report
- failures can be grouped by tool, guide, benchmark, or provider
- current status: satisfied for structured reporting; scoring, benchmark ids, and provider comparison remain Phase 4 work

## [DONE] Phase 4 - Benchmarking

Goal: measure progress with controlled tasks and objective scoring.

Status:

- completed with candidate-based campaign plumbing in `tests/benchmarks/`, `tests/scripts/`, and `review/schemas/`
- phase 4.1 fixture-driven refactor is now implemented on top of the campaign runner:
  - the runner injects role prompts directly
  - mutating scenarios now target a runner-imported `BenchAI_*` project from `template_ngxBuilderIonic`
  - cleanup now deletes only the owned benchmark project through MCP `project-delete`
- benchmark suite `phase4_v1` now defines `6` scored scenarios
- run critic and aggregate critic now target explicit artifact paths, never `latest log`
- PostgreSQL fixture `postgres-v1` is real and deterministic, with fresh container lifecycle per SQL run
- campaign outputs are isolated under `tests/campaigns/<candidateId>/` and ignored by Git
- a full synthetic campaign executed successfully against candidate `0.0.11+9acfece` and produced scored outputs plus grouped findings
- fixture validation was executed against a live Docker-backed PostgreSQL container
- the earlier thin-slice milestones on `0.0.12+57e32e2` and `0.0.13+c598ae5` are now superseded by one trustworthy full-suite closure baseline on candidate `0.0.15+d6e2037`
- the closure baseline ran all `6` scenarios on the same candidate with explicit run critics and one aggregate critic:
  - `planner-facade-stub-v1`: `PASS`
  - `backend-sequence-authoring-v1`: `PASS`
  - `http-facade-integration-v1`: `PASS`
  - `ngx-contract-ui-v1`: `PASS`
  - `recovery-invalid-target-v1`: `PASS`
  - `sql-facade-integration-postgres-v1`: `PASS`
- the final aggregate for `0.0.15+d6e2037` is now the trusted Phase 4 baseline:
  - `overallScore = 83.42`
  - `passCount = 6`
  - `failCount = 0`
  - `skippedCount = 0`
  - `gateFailureCount = 0`
  - `finishedAt` populated in the campaign manifest
- benchmark-mode field feedback was triaged once after the closure run and did not surface a new benchmark-owned defect that would reopen Phase 4
- a mode-gated field feedback channel is now available for real POC runs through the Convertigo global symbol `${mcp.report.mode=off}`, without coupling ad hoc feedback to the benchmark critic flow

Delivered benchmark families:

- project discovery
- sequence authoring
- HTTP transaction authoring
- NGX UI mutation
- recovery from invalid QName or invalid assumptions
- SQL facade integration

Delivered scoring and campaign assets:

- benchmark suite schema: `review/schemas/benchmark-suite.schema.json`
- campaign aggregate schema: `review/schemas/campaign-aggregate.schema.json`
- suite manifest: `tests/benchmarks/suites/phase4_v1.json`
- campaign runner: `tests/scripts/run_campaign.py`
- campaign scorer: `tests/scripts/score_campaign.py`
- explicit run critic prompt: `tests/prompt_critic_run_review.txt`
- explicit aggregate critic prompt: `tests/prompt_critic_aggregate_review.txt`
- SQL fixture assets: `tests/fixtures/sql/postgres-v1/`
- campaign artifact layout:
  - `tests/campaigns/<candidateId>/manifest.json`
  - `tests/campaigns/<candidateId>/runs/<scenarioId>/<runId>/...`
  - `tests/campaigns/<candidateId>/critics/<scenarioId>/<runId>/...`
  - `tests/campaigns/<candidateId>/aggregate/findings.json`
  - `tests/campaigns/<candidateId>/aggregate/findings.md`

Evaluation dimensions:

- task success
- correctness of created or modified objects
- number of tool calls
- latency
- unnecessary RAG usage
- recoverability after errors
- respect of guidance and warnings
- clarity of final critique

Validated outcomes:

- one candidate campaign can now generate run reports, critic reports, an aggregate report, and weighted scores in one pass
- explicit run-targeted critics avoid recursive `latest log` behavior
- the closure baseline now distinguishes real candidate weaknesses from benchmark defects:
  - repeated MCP/tooling friction remains visible in the aggregate critic
  - no scenario is left `UNKNOWN`
  - any remaining open items are accepted as real MCP/prompt UX findings, not benchmark-plumbing bugs
- SQL runs are backed by a fresh PostgreSQL container initialized from tracked scripts
- campaign layout is parallel-safe by identifier and directory structure even though execution is still sequential by default
- mutating scenarios no longer depend on opportunistic workspace project discovery; the runner now prepares and tears down one explicit benchmark project per run

Exit criteria:

- at least a small benchmark suite is stable and repeatable
- benchmark scoring is automated enough to compare providers and prompts
- current status: satisfied for benchmark plumbing, scoring, deterministic SQL fixtures, and one real live full-suite baseline on `0.0.15+d6e2037`; Phase 5 may now start from this baseline

## Phase 5 - Automated Improvement Loop

Goal: let the project improve itself through repeated critique and correction.

Status:

- scaffolding implemented in `tests/scripts/run_improvement_cycle.py`, `tests/scripts/compare_campaigns.py`, `tests/prompt_maintainer_cycle.txt`, and `review/schemas/`
- the maintainer role prompt is now part of the prompt catalog as `convertigo-maintainer`
- the repository prompt catalog now carries `8` file-backed prompts, with `convertigo-maintainer` linked from the relevant guides
- the repository project version is now `0.0.15` and the current trusted Phase 5 baseline candidate is `0.0.15+a371c89`
- runtime artifacts are isolated under `tests/improvement/<baselineCandidateId>/<cycleId>/`
- schemas and synthetic comparison outputs validate successfully against the new Phase 5 contracts
- the improvement orchestrator already enforces one clean baseline repository before it opens a cycle
- `codex exec` is healthy again for live runs, and the first real mixed-intake maintainer cycle (`cycle-001`) has now been executed against `finding-httpconnector-port-coercion`
- `cycle-001` validated the narrow Phase 5 loop:
  - the selected finding was corroborated by both benchmark history and feedback triage
  - the maintainer produced and committed candidate `0.0.16+14ab72e`
  - targeted replay on `http-facade-integration-v1` passed and the original `port=0` coercion evidence disappeared
  - full replay then rejected the candidate because previously passing scenarios regressed (`ngx-contract-ui-v1`) or introduced new gate failures (`recovery-invalid-target-v1`)
- `cycle-002` has now been executed against `finding-ngx-ui-control-directive-wrapper-semantics`
  - the selected finding was corroborated by both the project-editor feedback triage batch and the rejected NGX replay evidence from `cycle-001`
  - the maintainer produced and committed candidate `0.0.16+62808a5`
  - targeted replay on `ngx-contract-ui-v1` correctly rejected the candidate before full-suite replay
  - the rejection reason was not the original wrapper-placement defect anymore; the run repaired the tree structure, but the runner-prepared facade requestable still returned an empty runtime payload instead of the expected stub-backed contract
  - the improvement orchestrator now records this kind of targeted replay failure as `REJECTED` with explicit comparison artifacts instead of misclassifying it as `BLOCKED`
- Phase 5 remains open because the loop is now proven end-to-end, but the first candidate was correctly rejected instead of promoted

Phase 5 v1 loop:

1. pick one scored Phase 4 baseline campaign
2. build a compact maintainer packet from grouped findings and cited evidence
3. open one isolated candidate worktree and branch
4. run one maintainer session that applies the smallest coherent patch set, bumps the version, and commits one candidate
5. replay the same benchmark slice against the same provider/model/codex version tuple
6. compare baseline vs replay with an explicit accept/reject/block verdict

Phase 5 v1 outputs:

- `tests/improvement/<baselineCandidateId>/<cycleId>/manifest.json`
- `tests/improvement/<baselineCandidateId>/<cycleId>/maintainer/packet.json`
- `tests/improvement/<baselineCandidateId>/<cycleId>/maintainer/prompt.txt`
- `tests/improvement/<baselineCandidateId>/<cycleId>/candidate/metadata.json`
- `tests/improvement/<baselineCandidateId>/<cycleId>/compare/comparison.json`

Current live outcome:

- baseline: `0.0.15+a371c89`
- cycle: `cycle-001`
- targeted finding: `finding-httpconnector-port-coercion`
- targeted replay verdict: `PASS`
- full replay verdict: `REJECTED`
- rejection reason: at least one previously passing scenario regressed to `FAIL`
- cycle: `cycle-002`
- targeted finding: `finding-ngx-ui-control-directive-wrapper-semantics`
- targeted replay verdict: `REJECTED`
- full replay verdict: not attempted
- rejection reason: the NGX candidate repaired wrapper placement, but the runner-prepared facade requestable still returned an empty runtime payload, so the targeted replay failed before full-suite replay

## [DONE] Phase 4.2 - Field Feedback Channel

Goal: capture reusable MCP/doc/prompt friction from real runs without forcing
every POC through the full benchmark critic pipeline.

Status:

- completed as a mode-gated runtime feature driven by the Convertigo global
  symbol `${mcp.report.mode=off}`
- undefined symbol and explicit `off` are intentionally identical
- the public MCP surface now hides or exposes `report-create` dynamically
  without rewriting prompt files on disk
- prompt feedback hints are appended at runtime only in `suggest` and
  `benchmark` modes
- field feedback reports are stored as runtime JSON artifacts under
  `feedback/inbox/YYYY/MM/`

Delivered assets:

- helper: `js/reporting.js`
- tool: `_c8oProject/sequences/tools_report_create.yaml`
- schema: `review/schemas/feedback-report.schema.json`

Behavior:

- `off`
  - no `report-create` in `tools/list`
  - no feedback capability in `initialize`
  - no feedback suffix in `prompts/call`
- `suggest`
  - `report-create` visible
  - optional short feedback suffix in prompts
- `benchmark`
  - same tool exposure as `suggest`
  - stronger benchmark-specific prompt suffix

Exit criteria:

- field feedback can be enabled or disabled at runtime through the symbol
- the feature stays invisible in production mode
- feedback artifacts remain separate from benchmark critics and Phase 5
  maintainer ingestion

## [DONE] Phase 4.3 - Feedback Triage

Goal: consolidate raw `report-create` inbox files into one reviewed backlog
before any maintainer intake.

Status:

- completed as a local triage workflow under `feedback/triage/<batchId>/`
- raw inbox files remain untouched under `feedback/inbox/`
- the workflow reuses `convertigo-critic` instead of adding a new public MCP
  role or tool
- triage output now classifies raw reports as MCP-owned, external,
  already-fixed, split-required, or noise
- the first batch on the current inbox closes one already-fixed MCP finding,
  routes one finding to `codex-cli-multiagent`, and splits one composite prompt
  report into two MCP-owned findings

Delivered assets:

- packet schema: `review/schemas/feedback-triage-packet.schema.json`
- consolidation schema: `review/schemas/feedback-consolidation.schema.json`
- orchestrator: `review/scripts/run_feedback_triage.py`
- critic scenario prompt: `tests/prompt_feedback_inbox_review.txt`
- runtime layout:
  - `feedback/triage/<batchId>/manifest.json`
  - `feedback/triage/<batchId>/packet.json`
  - `feedback/triage/<batchId>/packet.md`
  - `feedback/triage/<batchId>/critic/run/...`
  - `feedback/triage/<batchId>/consolidation.json`
  - `feedback/triage/<batchId>/consolidation.md`

Behavior:

- triage validates each inbox file against `feedback-report.schema.json`
- each source report gets one disposition:
  - `OPEN`
  - `CLOSED_ALREADY_FIXED`
  - `ROUTE_EXTERNAL`
  - `SPLIT_REQUIRED`
  - `DROP_NOISE`
- grouped findings carry one clear `targetRepo`, `recommendedOwner`, and
  `nextAction`
- cross-repo findings are preserved and routed, but do not trigger automation
  outside this repo
- Phase 5 maintainers should consume triaged findings, not the raw inbox

Exit criteria:

- field feedback can be reviewed in explicit batches without mutating the inbox
- already-fixed findings cite current repo evidence
- composite reports can be split into maintainable findings
- external findings are classified without being dropped

Loop:

1. execute benchmark with a selected provider, model, and prompt set
2. collect structured reports
3. ask critic agents to identify MCP UX gaps, documentation gaps, and tool contract issues
4. ask maintainer agents to propose patches
5. replay benchmarks
6. keep only changes that improve measurable results or reduce repeated failures

Exit criteria:

- the loop improves benchmark results over several iterations
- regressions are detected automatically
- one full cycle can produce a maintainer packet, one committed candidate, one replay campaign, and one accept/reject/block verdict without manual log archaeology

## Phase 6 - Parallel Execution

Goal: accelerate iteration safely.

Principles:

- isolate each run in a disposable environment
- avoid cross-run workspace pollution
- keep benchmark inputs deterministic
- keep logs and artifacts per run

Potential implementation directions:

- separate workspaces
- disposable Convertigo runtime instances
- Docker-based parallel workers
- provider-specific adapters behind the same benchmark harness

Exit criteria:

- multiple runs can execute in parallel without corrupting each other
- results remain attributable and reproducible

## Guide Awareness Design

The idea of versioned guides plus tool-level warnings is good, with constraints.

What is good:

- it acknowledges that LLM context is partial and unreliable
- it creates a formal link between tool usage and expected prior reading
- it gives tools a way to steer the model toward the right resource at the right time
- it creates measurable signals for benchmark analysis

What is risky:

- a model can claim it has read a guide without actually using it correctly
- adding a required `guides` field to every tool call increases noise and token cost
- unclear version names such as `c8o-12` or `frontend-ngx-23` will age badly and be hard to interpret
- if warnings are too frequent, models will ignore them

Recommended approach:

- keep one starting guide mandatory in practice
- use stable guide identifiers plus explicit revisions, not opaque numeric labels
- treat `guideContext` as a hint, not as proof
- prefer session-level or batch-level guide context when available, but keep the design stateless-compatible
- let tools emit targeted warnings only when a mismatch is likely and relevant

Preferred model:

- caller declares `guideContext.seen = ["convertigo/start@1", "convertigo/backend-sequences@1"]`
- tool metadata declares `recommendedGuides` and optional `requiredGuides`
- when the tool sees a likely mismatch, it returns a warning with the exact missing guide identifier and resource URI
- when no session concept exists, `guideContext` can live in request metadata or batch metadata without changing the core model

Warning example:

- `"This mutation targets sequence objects, but guide convertigo/backend-sequences@1 is not declared in guideContext.seen. Read convertigo://resources/backend-sequences before continuing."`

Important rule:

- never block only because the guide was not declared
- warn first
- use benchmark results to decide later whether some operations should become stricter

Placement in the roadmap:

- design the guide-awareness model in Phase 1
- expose the metadata in the MCP contract during Phase 0 and Phase 1
- measure its usefulness during Phase 4 benchmarks
- tune warning behavior during Phase 5 improvement loops

## Immediate Next Steps

- define the Phase 4 benchmark manifest and scoring contract
- turn the current probe set into stable benchmark scenarios with acceptance assertions
- decide how `critic` outputs feed future benchmark scoring without mixing reporting and scoring too early
- add provider/model adapters that reuse the same run-report schema
