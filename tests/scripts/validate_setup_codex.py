#!/usr/bin/env python3
import argparse
import json
import tempfile
from pathlib import Path

from validate_crud_tools import DEFAULT_MCP_URL, ROOT, call_tool, wait_for_mcp_ready


def parse_args():
    parser = argparse.ArgumentParser(description="Validate the local _setupCodex Studio sequence against temporary Codex homes.")
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
    if isinstance(result, dict) and "result" in result and isinstance(result["result"], dict):
        return result["result"]
    return result


def load_text(path):
    return Path(path).read_text(encoding="utf-8")


def contains_lines(text, expected_lines):
    for line in expected_lines:
        if line not in text:
            raise RuntimeError(f"Missing expected line: {line}")


def run_case(mcp_url, codex_home, initial_config, expected_skill_status, expected_config_status, resolved_mcp_url):
    codex_home = Path(codex_home)
    codex_home.mkdir(parents=True, exist_ok=True)
    if initial_config is not None:
        (codex_home / "config.toml").write_text(initial_config, encoding="utf-8")

    result = requestable_execute(
        mcp_url,
        "ConvertigoMCP._setupCodex",
        {
            "codexHome": str(codex_home),
            "mcpUrl": resolved_mcp_url,
        },
    )

    assert_true(result.get("skillStatus") == expected_skill_status, f"Unexpected skillStatus: {result}")
    assert_true(result.get("configStatus") == expected_config_status, f"Unexpected configStatus: {result}")
    assert_true(result.get("resolvedMcpUrl") == resolved_mcp_url, f"Unexpected resolvedMcpUrl: {result}")

    skill_path = Path(result["skillPath"])
    config_path = codex_home / "config.toml"
    assert_true(skill_path.exists(), f"Skill file missing: {skill_path}")
    assert_true(config_path.exists(), f"Config file missing: {config_path}")

    skill_text = load_text(skill_path)
    contains_lines(
        skill_text,
        [
            "name: convertigo-generalist",
            "`convertigo://capabilities`",
            "`convertigo://recipes/quickstart`",
            "`convertigo://resources/convertigo-start`",
            "`convertigo://resources/convertigo-crud-fastpath`",
            "Do not invent prefixes, suffixes, or dates.",
            "Do not open `DisplayObjects/mobile/...` against the live HMR viewer.",
            "Never edit or repair `_private/ionic`, `DisplayObjects`, `dist`, or other generated artifacts.",
            "run `marketplace-import` with that exact name",
        ],
    )

    config_text = load_text(config_path)
    contains_lines(
        config_text,
        [
            "[mcp_servers.convertigo]",
            f'url = "{resolved_mcp_url}"',
            "startup_timeout_sec = 60",
        ],
    )
    return result


def main():
    args = parse_args()
    wait_for_mcp_ready(args.mcp_url, timeout=90)

    with tempfile.TemporaryDirectory(prefix="setup_codex_") as temp_root:
        base = Path(temp_root)

        run_case(args.mcp_url, base / "empty", None, "created", "created", args.resolved_mcp_url)

        initial_without_convertigo = "\n".join(
            [
                'model = "gpt-5.4"',
                "",
                "[mcp_servers.github]",
                'command = "npx"',
                "",
            ]
        )
        run_case(args.mcp_url, base / "append", initial_without_convertigo, "created", "updated", args.resolved_mcp_url)

        initial_with_convertigo = "\n".join(
            [
                'model = "gpt-5.4"',
                "",
                "[mcp_servers.convertigo]",
                'url = "http://localhost:9999/convertigo/api/mcp"',
                "",
                "[mcp_servers.github]",
                'command = "npx"',
                "",
            ]
        )
        run_case(args.mcp_url, base / "update", initial_with_convertigo, "created", "updated", args.resolved_mcp_url)

        stable_home = base / "idempotent"
        run_case(args.mcp_url, stable_home, None, "created", "created", args.resolved_mcp_url)
        stable_second = requestable_execute(
            args.mcp_url,
            "ConvertigoMCP._setupCodex",
            {
                "codexHome": str(stable_home),
                "mcpUrl": args.resolved_mcp_url,
            },
        )
        assert_true(stable_second.get("skillStatus") == "unchanged", f"Second skillStatus should be unchanged: {stable_second}")
        assert_true(stable_second.get("configStatus") == "unchanged", f"Second configStatus should be unchanged: {stable_second}")

    print(json.dumps({"status": "ok", "validated": "_setupCodex"}, indent=2))


if __name__ == "__main__":
    main()
