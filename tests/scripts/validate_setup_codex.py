#!/usr/bin/env python3
import argparse
import json
import re
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


def skill_result(result, key):
    skills = result.get("skills")
    if isinstance(skills, dict) and isinstance(skills.get(key), dict):
        return skills[key]
    return {}


def contains_lines(text, expected_lines):
    for line in expected_lines:
        if line not in text:
            raise RuntimeError(f"Missing expected line: {line}")


def configured_mcp_url(url):
    base, marker, fragment = url.partition("#")
    if re.search(r"(^|[?&])jsonOnly=[^&]*", base, flags=re.IGNORECASE):
        base = re.sub(r"(^|[?&])jsonOnly=[^&]*", r"\1jsonOnly=true", base, count=1, flags=re.IGNORECASE)
    else:
        base += ("&" if "?" in base else "?") + "jsonOnly=true"
    return base + (marker + fragment if marker else "")


def flow_mcp_url(url):
    return re.sub(r"/api/mcp(?=\?|#|$)", "/api/flow-mcp", url, count=1, flags=re.IGNORECASE)


def run_case(
    mcp_url,
    codex_home,
    initial_config,
    expected_skill_status,
    expected_config_status,
    resolved_mcp_url,
    mcp_token=None,
):
    codex_home = Path(codex_home)
    codex_home.mkdir(parents=True, exist_ok=True)
    if initial_config is not None:
        (codex_home / "config.toml").write_text(initial_config, encoding="utf-8")

    variables = {
        "codexHome": str(codex_home),
        "mcpUrl": resolved_mcp_url,
    }
    if mcp_token is not None:
        variables["mcpToken"] = mcp_token

    result = requestable_execute(
        mcp_url,
        "lib_ConvertigoMCP._setupCodex",
        variables,
    )

    assert_true(result.get("skillStatus") == expected_skill_status, f"Unexpected skillStatus: {result}")
    assert_true(result.get("configStatus") == expected_config_status, f"Unexpected configStatus: {result}")
    assert_true(result.get("resolvedMcpUrl") == resolved_mcp_url, f"Unexpected resolvedMcpUrl: {result}")
    assert_true(result.get("configuredMcpUrl") == configured_mcp_url(resolved_mcp_url), f"Unexpected configuredMcpUrl: {result}")
    assert_true(bool(result.get("tokenConfigured")) == bool(mcp_token), f"Unexpected tokenConfigured: {result}")
    assert_true(skill_result(result, "generalist").get("status") == expected_skill_status, f"Unexpected generalist skill status: {result}")
    assert_true(skill_result(result, "nocode").get("status") == expected_skill_status, f"Unexpected nocode skill status: {result}")

    skill_path = Path(result["skillPath"])
    nocode_skill_path = Path(result["skillPaths"]["nocode"])
    config_path = codex_home / "config.toml"
    assert_true(skill_path.exists(), f"Skill file missing: {skill_path}")
    assert_true(nocode_skill_path.exists(), f"NoCode skill file missing: {nocode_skill_path}")
    assert_true(config_path.exists(), f"Config file missing: {config_path}")

    skill_text = load_text(skill_path)
    contains_lines(
        skill_text,
        [
            "name: convertigo-generalist",
            "Skill guidance version:",
            "MCP guidance version",
            "params._meta.convertigoGuidanceVersion",
            "_meta.convertigoGuidanceWarning",
            "first guarded Convertigo `tools/call`",
            "once per agent conversation",
            "On follow-up turns",
            "`convertigo://capabilities`",
            "`convertigo://recipes/quickstart`",
            "`convertigo://resources/convertigo-start`",
            "`convertigo://resources/convertigo-crud-fastpath`",
            "Do not call `resources/list`, `resources/templates/list`, or `prompts/list`",
            "## Tool economy and convergence",
            "already used successfully in the current conversation",
            "Common NGX contracts that do not require palette discovery",
            "Skip `palette-list` and `palette-describe`",
            "UIPageEvent#UIPageEvent.viewEvent",
            "optimizeMutations:true",
            "Do not inspect `ALL_TOOLS`",
            "target QName in `target`, never in `qname`",
            "Property patches also belong under `tree`",
            "Keep structural proof compact",
            "one readiness check and one acceptance-oriented browser proof",
            "implemented but functionally unvalidated",
            "## NGX authoring invariants",
            "trigger Angular change detection through the supported page context in the same callback",
            "Every normal `UICustomAction` completion path must call `resolve(...)` or `reject(...)`",
            "Never use `this.c8o.page.detectChanges()`",
            "preserve the complete existing string and every `Begin_c8o_...`",
            "Never recursively search a drive root, user profile, workspace root",
            "stateOnly:true, wait:true, timeoutSec:180",
            "If no project is selected and the user explicitly asks to create a new project or application",
            "Do not invent prefixes, suffixes, or dates.",
            "Do not open `DisplayObjects/mobile/...` against the live HMR viewer.",
            "If a state-only call returns `status:\"stopped\"`, do not poll it again",
            "Studio JxBrowser exposes one existing visible page over CDP, not a normal multi-tab browser",
            '`playwright.browser_tabs({action:"list"})`',
            '`playwright.browser_find({text:"<visible text>"})`',
            '`playwright.browser_evaluate({function:"..."})`',
            '`log-view({project:"<targetProject>",level:"error",limit:40,timeoutMs:0})`',
            "managed Playwright MCP configuration must be refreshed",
            "Never edit or repair `_private/ionic`, `DisplayObjects`, `dist`, or other generated artifacts.",
            "run `marketplace-import` with that exact name",
            "Project review, audit, expertise note, client synthesis, hardening plan, recommendations, or V1/V2 comparison",
            "`convertigo://resources/convertigo-project-review`",
            "Convertigo Project Review Guide",
        ],
    )

    nocode_skill_text = load_text(nocode_skill_path)
    contains_lines(
        nocode_skill_text,
        [
            "name: convertigo-nocode",
            "Skill guidance version:",
            "MCP guidance version",
            "params._meta.convertigoGuidanceVersion",
            "_meta.convertigoGuidanceWarning",
            f"Expected MCP endpoint: `{resolved_mcp_url}`",
            "`nocode-form-contract-get`",
            "`nocode-form-edit`",
            "`nocode-form-update`",
            "`nocode-baserow-catalog-list`",
            "Do not use Convertigo low-code tools to compensate for missing no-code capability.",
        ],
    )

    config_text = load_text(config_path)
    expected_lines = [
        "[mcp_servers.convertigo]",
        f'url = "{configured_mcp_url(resolved_mcp_url)}"',
        "startup_timeout_sec = 60",
        "[mcp_servers.convertigo.http_headers]",
        '"X-Convertigo-Guidance-Version" = "2026-09-04.vibe-serial-transport-v1"',
    ]
    flow_enabled = bool(result.get("configuredFlowMcpUrl"))
    if flow_enabled:
        expected_lines.extend(
            [
                "[mcp_servers.convertigo-flow]",
                f'url = "{flow_mcp_url(configured_mcp_url(resolved_mcp_url))}"',
                "[mcp_servers.convertigo-flow.http_headers]",
            ]
        )
    contains_lines(config_text, expected_lines)
    if not flow_enabled:
        assert_true("convertigo-flow" not in config_text, config_text)
    if mcp_token:
        expected_token_count = 2 if flow_enabled else 1
        assert_true(config_text.count(f'Authorization = "Bearer {mcp_token}"') == expected_token_count, config_text)
        assert_true("[mcp_servers.convertigo.env_http_headers]" not in config_text, config_text)
        assert_true("[mcp_servers.convertigo-flow.env_http_headers]" not in config_text, config_text)
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

        run_case(
            args.mcp_url,
            base / "query",
            None,
            "created",
            "created",
            args.resolved_mcp_url + "?transport=managed&jsonOnly=false",
        )

        malformed_token = "eyJhbGciOiJIUzI1NiJ9.invalid.signature"
        malformed_config = "\n".join(
            [
                "[mcp_servers.convertigo]",
                f'url = "{configured_mcp_url(args.resolved_mcp_url)}"',
                "",
                "[mcp_servers.convertigo.http_headers]",
                'X-Convertigo-Guidance-Version = "old"',
                "",
                "[mcp_servers.convertigo.env_http_headers]",
                f'CONVERTIGO_MCP_TOKEN = "{malformed_token}"',
                "",
            ]
        )
        run_case(
            args.mcp_url,
            base / "token",
            malformed_config,
            "created",
            "updated",
            args.resolved_mcp_url,
            mcp_token=malformed_token,
        )

        stable_home = base / "idempotent"
        run_case(args.mcp_url, stable_home, None, "created", "created", args.resolved_mcp_url)
        stable_second = requestable_execute(
            args.mcp_url,
            "lib_ConvertigoMCP._setupCodex",
            {
                "codexHome": str(stable_home),
                "mcpUrl": args.resolved_mcp_url,
            },
        )
        assert_true(stable_second.get("skillStatus") == "unchanged", f"Second skillStatus should be unchanged: {stable_second}")
        assert_true(skill_result(stable_second, "generalist").get("status") == "unchanged", f"Second generalist status should be unchanged: {stable_second}")
        assert_true(skill_result(stable_second, "nocode").get("status") == "unchanged", f"Second nocode status should be unchanged: {stable_second}")
        assert_true(stable_second.get("configStatus") == "unchanged", f"Second configStatus should be unchanged: {stable_second}")

    print(json.dumps({"status": "ok", "validated": "_setupCodex"}, indent=2))


if __name__ == "__main__":
    main()
