# Codex CLI prompts (`codex_test`)

This folder stores reproducible prompts/scripts for running Codex CLI scenarios locally. Raw logs stay in `tests/logs`, derived reports in `tests/reports`, and work files in `tests/workspace` (all ignored by Git).

- `prompt.txt`: Main end-to-end HTTP contract scenario. The agent must fetch `convertigo-http`.
- `prompt_analyze_sentence.txt`: Backend sequence scenario. The agent must fetch `convertigo-backend`.
- `prompt_facade_stub_probe.txt`: Planner probe. The agent must fetch `convertigo-planner`.
- `prompt_http_facade_probe.txt`: HTTP-behind-facade probe. The agent must fetch `convertigo-http`.
- `prompt_ngx_contract_probe.txt`: NGX probe. The agent must fetch `convertigo-frontend-ngx`.
- `prompt_recovery_invalid_target.txt`: Recovery probe for invalid target assumptions. The agent must fetch `convertigo-backend`.
- `prompt_sql_facade_probe.txt`: PostgreSQL-backed SQL facade probe. The agent must fetch `convertigo-sql`.
- `prompt_uistyle_stylecontent.txt`: UI regression scenario. The agent must fetch `convertigo-frontend-ngx`.
- `prompt_critic_review.txt`: Legacy critic review of the latest prior probe log. Kept for history only.
- `prompt_critic_run_review.txt`: Critic review of one explicit benchmark run. The agent must fetch `convertigo-critic`.
- `prompt_critic_aggregate_review.txt`: Critic review of one explicit benchmark campaign. The agent must fetch `convertigo-critic`.
- `run_prompt.sh`: Helper to run Codex CLI from the repository root (`bash tests/run_prompt.sh [prompt_file] [run_label] [role_prompt_name]`). When the third argument is set, the script fetches the role prompt from MCP first and injects it into the Codex run.
- `scripts/report_codex_run.py`: Converts one raw Codex CLI log into `report.json` plus `summary.md`.
- `scripts/run_campaign.py`: Runs one benchmark campaign for a frozen MCP candidate.
- `scripts/score_campaign.py`: Scores one benchmark campaign and writes aggregate findings.
- `benchmarks/suites/phase4_v1.json`: Tracked benchmark suite manifest for Phase 4.
- `fixtures/sql/postgres-v1/`: PostgreSQL fixture used by the SQL benchmark scenario.

All prompts are written in English and stay scenario-specific. The preferred validation path is to inject the matching MCP role prompt through `run_prompt.sh`, not to duplicate role instructions inside the scenario file. Unless the prompt says otherwise, target project selection is deterministic: use the first loaded project from `codex_test`, `firstTimeSuccess`, `MyTemplateNgxTest2`, `MyNewApp`. Probe prompts must end with concrete pass/fail or skip evidence plus one short MCP critique item.

Runtime artifact layout:

- Raw log: `tests/logs/<runId>.log`
- JSON report: `tests/reports/<runId>/report.json`
- Markdown summary: `tests/reports/<runId>/summary.md`

The runner prints all three paths at the end of each run. Reports are derived artifacts, not tracked repository content.

Campaign artifact layout:

- Campaign root: `tests/campaigns/<candidateId>/`
- Campaign manifest: `tests/campaigns/<candidateId>/manifest.json`
- Scenario runs: `tests/campaigns/<candidateId>/runs/<scenarioId>/<runId>/`
- Run critics: `tests/campaigns/<candidateId>/critics/<scenarioId>/<runId>/`
- Aggregate output: `tests/campaigns/<candidateId>/aggregate/`
- Isolated workspaces: `tests/campaigns/<candidateId>/workspaces/<scenarioId>/<workspaceId>/`
- SQL fixture runtime metadata: `tests/campaigns/<candidateId>/fixtures/sql/<runId>/`

Phase 4 benchmark campaigns are file-first and sequential by default, but their layout is parallel-safe. Critic prompts must target explicit report paths, never the latest log.

Run one campaign:

```bash
python3 tests/scripts/run_campaign.py \
  --suite tests/benchmarks/suites/phase4_v1.json
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
