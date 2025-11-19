# Codex CLI prompts (`codex_test`)

This folder stores reproducible prompts/scripts for running Codex CLI scenarios locally. Logs and work files stay inside `tests/logs` and `tests/workspace` (ignored by Git).

- `prompt.txt`: Main end-to-end scenario (creates/tests `codex_test.analyze_sentence`).
- `run_prompt.sh`: Helper to run Codex CLI from the repository root (`bash tests/run_prompt.sh`). Pass a custom prompt file path as the first argument if you need a variant.

All prompts are written in English and reference the `codex_test` project so we avoid touching `codex_tooling`.
