# Codex CLI test prompts

This folder stores reproducible prompts/scripts for running Codex CLI scenarios locally. Logs and work files stay inside \\	ests/logs\\ and \\	ests/workspace\\ (see \\.gitignore\\).

- \\prompt.txt\\: Main end-to-end scenario (builds \\codex_test.analyze_sentence\\).
- \\prompt_read.txt\\: Minimal scenario that only checks resource-reading behaviour.
- \\
un_prompt.sh\\: Helper to run Codex CLI from the repository root (ash tests/run_prompt.sh). Pass a custom prompt file path as the first argument if needed.

All prompts are in English and reference the codex_test project so the runs stay isolated from codex_tooling.
