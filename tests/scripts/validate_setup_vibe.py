#!/usr/bin/env python3
import argparse
import json
import tempfile
from pathlib import Path

from validate_crud_tools import DEFAULT_MCP_URL, call_tool, wait_for_mcp_ready


def parse_args():
    parser = argparse.ArgumentParser(description="Validate the local _setupVibe Studio sequence against temporary Vibe homes.")
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL)
    parser.add_argument("--resolved-mcp-url", default="http://localhost:18080/convertigo/api/mcp")
    return parser.parse_args()


def assert_true(condition, message):
    if not condition:
        raise RuntimeError(message)


def requestable_execute(mcp_url, requestable, variables):
    result = call_tool(
        mcp_url,
        "requestable-execute",
        {
            "requestable": requestable,
            "variables": variables,
        },
        timeout=120,
    )
    for _ in range(3):
        if (
            isinstance(result, dict)
            and isinstance(result.get("payload"), dict)
            and isinstance(result["payload"].get("result"), dict)
        ):
            result = result["payload"]["result"]
            continue
        if isinstance(result, dict) and "result" in result and isinstance(result["result"], dict):
            result = result["result"]
            continue
        break
    return result


def load_text(path):
    return Path(path).read_text(encoding="utf-8")


def contains_lines(text, expected_lines):
    for line in expected_lines:
        if line not in text:
            raise RuntimeError(f"Missing expected line: {line}")


def run_case(mcp_url, vibe_home, initial_config, replace_config, expected_skill_status, expected_config_status, resolved_mcp_url):
    vibe_home = Path(vibe_home)
    vibe_home.mkdir(parents=True, exist_ok=True)
    if initial_config is not None:
        (vibe_home / "config.toml").write_text(initial_config, encoding="utf-8")

    result = requestable_execute(
        mcp_url,
        "ConvertigoMCP._setupVibe",
        {
            "vibeHome": str(vibe_home),
            "mcpUrl": resolved_mcp_url,
            "replaceConfig": replace_config,
        },
    )

    assert_true(result.get("skillStatus") == expected_skill_status, f"Unexpected skillStatus: {result}")
    assert_true(result.get("agentsStatus") == expected_skill_status, f"Unexpected agentsStatus: {result}")
    assert_true(result.get("configStatus") == expected_config_status, f"Unexpected configStatus: {result}")
    assert_true(result.get("resolvedMcpUrl") == resolved_mcp_url, f"Unexpected resolvedMcpUrl: {result}")

    skill_path = Path(result["skillPath"])
    agents_path = Path(result["agentsPath"])
    config_path = vibe_home / "config.toml"
    assert_true(skill_path.exists(), f"Skill file missing: {skill_path}")
    assert_true(agents_path.exists(), f"AGENTS.md missing: {agents_path}")
    assert_true(config_path.exists(), f"Config file missing: {config_path}")

    skill_text = load_text(skill_path)
    contains_lines(
        skill_text,
        [
            "name: convertigo-vibe-generalist",
            "Skill guidance version:",
            "MCP guidance version",
            "params._meta.convertigoGuidanceVersion",
            "_meta.convertigoGuidanceWarning",
            "first guarded Convertigo `tools/call`",
            "`convertigo://capabilities`",
            "`convertigo://recipes/quickstart`",
            "`convertigo://resources/convertigo-start`",
            "`convertigo://resources/convertigo-vibe-start`",
            "`Convertigo_requestable-execute`",
            "Do not install or modify the Codex `convertigo-generalist` skill from this Vibe adapter.",
            "stale incompatible properties",
            "project review, audit, expertise note, client synthesis, hardening plan, recommendations, or V1/V2 comparison",
            "`convertigo://resources/convertigo-project-review`",
            "Convertigo Project Review Guide",
        ],
    )

    agents_text = load_text(agents_path)
    contains_lines(
        agents_text,
        [
            "use the `convertigo-vibe-generalist` skill",
            "Skill guidance version",
            "X-Convertigo-Guidance-Version",
            "_meta.convertigoGuidanceWarning",
            "first guarded Convertigo tool call",
            "Provide model credentials through the process environment",
            "`convertigo://resources/convertigo-vibe-start`",
        ],
    )

    config_text = load_text(config_path)
    contains_lines(
        config_text,
        [
            'enabled_skills = ["convertigo-vibe-generalist"]',
            "[[mcp_servers]]",
            'name = "Convertigo"',
            f'url = "{resolved_mcp_url}"',
            "[tools.Convertigo_project-list]",
            "[tools.Convertigo_requestable-execute]",
            "[tools.Convertigo_databaseobject-tree-apply]",
            "[tools.Convertigo_project-save]",
        ],
    )
    return result


def main():
    args = parse_args()
    wait_for_mcp_ready(args.mcp_url, timeout=90)

    with tempfile.TemporaryDirectory(prefix="setup_vibe_") as temp_root:
        base = Path(temp_root)

        run_case(args.mcp_url, base / "empty", None, True, "created", "created", args.resolved_mcp_url)

        initial_without_convertigo = "\n".join(
            [
                'active_model = "mistral-medium-3.5"',
                "include_prompt_detail = true",
                "",
                "[tools.read]",
                'permission = "always"',
                "",
            ]
        )
        run_case(args.mcp_url, base / "patch", initial_without_convertigo, False, "created", "updated", args.resolved_mcp_url)

        initial_replace = "\n".join(
            [
                'active_model = "custom"',
                "",
                "[[mcp_servers]]",
                'name = "Other"',
                'transport = "http"',
                'url = "http://127.0.0.1:1234/mcp"',
                "",
            ]
        )
        run_case(args.mcp_url, base / "replace", initial_replace, True, "created", "updated", args.resolved_mcp_url)

        stable_home = base / "idempotent"
        run_case(args.mcp_url, stable_home, None, True, "created", "created", args.resolved_mcp_url)
        stable_second = requestable_execute(
            args.mcp_url,
            "ConvertigoMCP._setupVibe",
            {
                "vibeHome": str(stable_home),
                "mcpUrl": args.resolved_mcp_url,
                "replaceConfig": True,
            },
        )
        assert_true(stable_second.get("skillStatus") == "unchanged", f"Second skillStatus should be unchanged: {stable_second}")
        assert_true(stable_second.get("agentsStatus") == "unchanged", f"Second agentsStatus should be unchanged: {stable_second}")
        assert_true(stable_second.get("configStatus") == "unchanged", f"Second configStatus should be unchanged: {stable_second}")

    print(json.dumps({"status": "ok", "validated": "_setupVibe"}, indent=2))


if __name__ == "__main__":
    main()
