# Codex CLI prompts (`codex_test`)

This folder stores reproducible prompts/scripts for running Codex CLI scenarios locally. Logs and work files stay inside `tests/logs` and `tests/workspace` (ignored by Git).

- `prompt.txt`: Main end-to-end HTTP contract scenario. The agent must fetch `convertigo-http`.
- `prompt_analyze_sentence.txt`: Backend sequence scenario. The agent must fetch `convertigo-backend`.
- `prompt_facade_stub_probe.txt`: Planner probe. The agent must fetch `convertigo-planner`.
- `prompt_http_facade_probe.txt`: HTTP-behind-facade probe. The agent must fetch `convertigo-http`.
- `prompt_ngx_contract_probe.txt`: NGX probe. The agent must fetch `convertigo-frontend-ngx`.
- `prompt_uistyle_stylecontent.txt`: UI regression scenario. The agent must fetch `convertigo-frontend-ngx`.
- `prompt_critic_review.txt`: Critic review of the latest prior probe log. The agent must fetch `convertigo-critic`.
- `run_prompt.sh`: Helper to run Codex CLI from the repository root (`bash tests/run_prompt.sh [prompt_file] [run_label] [role_prompt_name]`). When the third argument is set, the script fetches the role prompt from MCP first and injects it into the Codex run.

All prompts are written in English and stay scenario-specific. The preferred validation path is to inject the matching MCP role prompt through `run_prompt.sh`, not to duplicate role instructions inside the scenario file. Unless the prompt says otherwise, target project selection is deterministic: use the first loaded project from `codex_test`, `firstTimeSuccess`, `MyTemplateNgxTest2`, `MyNewApp`. Probe prompts must end with concrete pass/fail or skip evidence plus one short MCP critique item.
