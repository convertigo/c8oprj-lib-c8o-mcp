# Codex CLI prompts (`codex_test`)

This folder stores reproducible prompts/scripts for running Codex CLI scenarios locally. Logs and work files stay inside `tests/logs` and `tests/workspace` (ignored by Git).

- `prompt.txt`: Main end-to-end scenario (creates/tests `codex_test.ip_info` behind an HTTP-backed contract).
- `prompt_analyze_sentence.txt`: Backend sequence scenario using the new start and backend guides.
- `prompt_facade_stub_probe.txt`: Stub-only facade probe validating contract-first backend delivery.
- `prompt_http_facade_probe.txt`: HTTP-behind-facade probe validating stable contract replacement.
- `prompt_ngx_contract_probe.txt`: NGX probe validating contract-bound UI structure or clean skip behavior.
- `prompt_uistyle_stylecontent.txt`: Regression scenario validating `UIStyle` CSS updates through `databaseobject-tree-apply` + `databaseobject-tree-get`.
- `run_prompt.sh`: Helper to run Codex CLI from the repository root (`bash tests/run_prompt.sh`). Pass a custom prompt file path as the first argument if you need a variant.

All prompts are written in English and should read the current Phase 1 guide set by URI, not the retired quickstart resource names. Probe prompts must end with concrete pass/fail or skip evidence plus one short MCP critique item.
