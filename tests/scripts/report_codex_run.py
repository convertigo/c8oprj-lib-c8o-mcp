#!/usr/bin/env python3
import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen


PROTOCOL_VERSION = "2025-06-18"
SCHEMA_VERSION = "1.0.0"
KV_RE = re.compile(r"^([a-z0-9_]+)=(.*)$")
HEADER_RE = re.compile(r"^(provider|model|reasoning effort|session id):\s*(.*)$")
RESULT_RE = re.compile(r"^`?RESULT:\s*(PASS|FAIL|SKIPPED|UNKNOWN)(?:\s*-\s*(.*?))?`?$")
TOOL_CALL_RE = re.compile(r"^tool ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\((.*)\)$")
TOOL_STATUS_RE = re.compile(
    r"^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\(.*\)\s+(success|failed)\s+in\s+([0-9.]+)(ms|s):$"
)
SECTION_RE = re.compile(r"^(?:##\s+(.+?)|\*\*(.+?)\*\*)\s*$")
MCP_STARTUP_FAIL_RE = re.compile(r"^mcp:\s+([A-Za-z0-9_-]+)\s+failed:\s+(.*)$")
WARN_LINE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T.*\s+WARN\s+")
PLAIN_SECTION_RE = re.compile(r"^[A-Z][A-Za-z0-9 /_-]{2,60}$")


def parse_args():
    parser = argparse.ArgumentParser(description="Normalize a codex-cli run log into JSON and Markdown reports.")
    parser.add_argument("--log", required=True, help="Path to the raw log file.")
    parser.add_argument("--out-dir", required=True, help="Output directory for report.json and summary.md.")
    parser.add_argument(
        "--mcp-url",
        default="http://localhost:18080/convertigo/api/mcp",
        help="Convertigo MCP endpoint used to enrich older logs.",
    )
    return parser.parse_args()


def call_mcp(url, payload):
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "MCP-Protocol-Version": PROTOCOL_VERSION,
        },
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        return json.load(response)


def fetch_server_info(mcp_url):
    try:
        response = call_mcp(mcp_url, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
    except (URLError, TimeoutError, json.JSONDecodeError):
        return {"name": None, "title": None, "version": None, "url": mcp_url}
    result = response.get("result", {})
    server_info = result.get("serverInfo", {})
    return {
        "name": server_info.get("name"),
        "title": server_info.get("title"),
        "version": server_info.get("version"),
        "url": mcp_url,
    }


def fetch_role_prompt_metadata(mcp_url, role_prompt_name):
    if not role_prompt_name or role_prompt_name == "none":
        return default_role_prompt()
    try:
        response = call_mcp(
            mcp_url,
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "prompts/call",
                "params": {"name": role_prompt_name},
            },
        )
    except (URLError, TimeoutError, json.JSONDecodeError):
        metadata = default_role_prompt()
        metadata["name"] = role_prompt_name
        return metadata
    result = response.get("result", {})
    return {
        "name": result.get("name", role_prompt_name),
        "promptId": result.get("promptId"),
        "revision": result.get("revision"),
        "roleId": result.get("roleId"),
        "guideIds": result.get("guideIds", []) or [],
        "recommendedTools": result.get("recommendedTools", []) or [],
        "handoffTo": result.get("handoffTo", []) or [],
        "outputContract": result.get("outputContract", []) or [],
        "mutatesProject": result.get("mutatesProject"),
    }


def default_role_prompt():
    return {
        "name": None,
        "promptId": None,
        "revision": None,
        "roleId": None,
        "guideIds": [],
        "recommendedTools": [],
        "handoffTo": [],
        "outputContract": [],
        "mutatesProject": None,
    }


def parse_iso_datetime(value):
    if not value or value in {"none", "null"}:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def to_millis(value, unit):
    if value is None:
        return None
    number = float(value)
    if unit == "s":
        return int(number * 1000)
    return int(number)


def parse_key_values(lines):
    parsed = {}
    started = False
    for line in lines:
        stripped = line.strip()
        match = KV_RE.match(stripped)
        if match:
            started = True
            parsed[match.group(1)] = match.group(2)
            continue
        if started:
            break
    return parsed


def parse_header(lines):
    header = {"provider": None, "model": None, "reasoning effort": None, "session id": None}
    separator_count = 0
    for line in lines:
        stripped = line.strip()
        if stripped == "--------":
            separator_count += 1
            if separator_count > 2:
                break
            continue
        if separator_count == 1:
            match = HEADER_RE.match(stripped)
            if match:
                header[match.group(1)] = match.group(2)
    return header


def parse_tool_calls(lines):
    total_tool_lines = 0
    tool_calls = []
    warnings = []
    by_server = Counter()
    by_tool = Counter()
    rag_calls = 0

    for index, line in enumerate(lines):
        tool_match = TOOL_CALL_RE.match(line.strip())
        if not tool_match:
            continue
        total_tool_lines += 1
        server, name = tool_match.group(1), tool_match.group(2)
        if server == "rag_mcp":
            rag_calls += 1
        status_match = None
        for follow_index in range(index + 1, min(index + 8, len(lines))):
            candidate = lines[follow_index].strip()
            candidate_match = TOOL_STATUS_RE.match(candidate)
            if candidate_match and candidate_match.group(1) == server and candidate_match.group(2) == name:
                status_match = candidate_match
                break
            if candidate.startswith("tool ") or candidate == "codex":
                break
        if not status_match:
            warnings.append(f"Parser warning: could not resolve status for tool call {server}.{name}.")
            continue
        duration_ms = to_millis(status_match.group(4), status_match.group(5))
        status = status_match.group(3)
        tool_calls.append(
            {
                "server": server,
                "name": name,
                "status": status,
                "durationMs": duration_ms,
            }
        )
        by_server[server] += 1
        by_tool[f"{server}.{name}"] += 1

    return {
        "toolCalls": tool_calls,
        "toolStats": {
            "totalToolCalls": total_tool_lines,
            "byServer": dict(by_server),
            "byTool": dict(by_tool),
            "ragCalls": rag_calls,
        },
        "warnings": warnings,
    }


def parse_result(lines):
    matches = []
    for index, line in enumerate(lines):
        match = RESULT_RE.match(line.strip())
        if match:
            matches.append((index, match.group(1), (match.group(2) or "").strip() or None))
    if not matches:
        return {"status": "UNKNOWN", "success": None, "reason": "No final RESULT line found."}, None
    index, status, reason = matches[-1]
    success = {"PASS": True, "FAIL": False, "SKIPPED": None, "UNKNOWN": None}[status]
    if status == "UNKNOWN" and reason is None:
        reason = "Run ended without a decisive result."
    return {"status": status, "success": success, "reason": reason}, index


def strip_trailing_housekeeping(lines):
    end = len(lines)
    while end > 0:
        candidate = lines[end - 1].strip()
        if not candidate:
            end -= 1
            continue
        if candidate.startswith("finished_at=") or candidate.startswith("Log: "):
            end -= 1
            continue
        if candidate == "tokens used":
            end -= 1
            continue
        if candidate.isdigit():
            end -= 1
            continue
        if WARN_LINE_RE.match(candidate):
            end -= 1
            continue
        break
    return lines[:end]


def extract_final_output(lines, result_index):
    trimmed = strip_trailing_housekeeping(lines)
    last_codex = None
    for index, line in enumerate(trimmed):
        if line.strip() == "codex":
            last_codex = index

    content_start = 0
    if last_codex is not None:
        separator_count = 0
        content_start = last_codex + 1
        for index in range(last_codex + 1, len(trimmed)):
            if trimmed[index].strip() == "--------":
                separator_count += 1
                if separator_count == 2:
                    content_start = index + 1
                    break

    if result_index is None:
        return "\n".join(trimmed[content_start:]).strip()
    return "\n".join(trimmed[content_start : result_index + 1]).strip()


def parse_sections(raw_text):
    section_names = []
    sections = {}
    current_name = None
    current_lines = []
    paragraph_gap = 0

    def flush():
        nonlocal current_name, current_lines, paragraph_gap
        if current_name is not None:
            section_lines = list(current_lines)
            while section_lines and RESULT_RE.match(section_lines[-1].strip()):
                section_lines.pop()
            sections[current_name] = "\n".join(section_lines).strip()
            section_names.append(current_name)
        current_name = None
        current_lines = []
        paragraph_gap = 0

    def is_plain_section_heading(line):
        text = line.strip()
        if not text or text.startswith("- ") or text.startswith("* ") or text.startswith("```") or text.startswith("RESULT:") or text.startswith("`RESULT:"):
            return False
        if not PLAIN_SECTION_RE.match(text):
            return False
        if text.lower() in {"tokens used", "codex"}:
            return False
        return text == text.title() or text in {"MCP Critique", "Open Handoff", "Runtime Evidence", "Contract Check", "Changed Objects", "Stub Status", "Work Split", "Validation Plan", "Findings", "Evidence Gaps", "Guide Compliance", "Recommendation", "Outcome", "Run", "Role Prompt", "Scenario", "Key Evidence", "Warnings / Errors"}

    for line in raw_text.splitlines():
        stripped = line.strip()
        section_match = SECTION_RE.match(line.strip())
        if section_match:
            flush()
            current_name = section_match.group(1) or section_match.group(2)
            continue
        if current_name is not None and not stripped:
            current_lines.append(line)
            paragraph_gap += 1
            continue
        if paragraph_gap > 0 and is_plain_section_heading(line):
            flush()
            current_name = stripped
            continue
        if current_name is None and is_plain_section_heading(line):
            current_name = stripped
            paragraph_gap = 0
            continue
        if current_name is not None:
            current_lines.append(line)
            paragraph_gap = 0
    flush()

    mcp_critique = None
    for key, value in sections.items():
        if key.strip().lower() == "mcp critique":
            mcp_critique = value or None
            break
    if mcp_critique is None:
        for line in raw_text.splitlines():
            if line.lower().startswith("mcp critique:"):
                mcp_critique = line.split(":", 1)[1].strip() or None
                break

    return {
        "rawText": raw_text,
        "sectionNames": section_names,
        "sections": sections,
        "mcpCritique": mcp_critique,
    }


def collect_warnings(lines):
    warnings = []
    key_values = parse_key_values(lines)
    for line in lines:
        match = MCP_STARTUP_FAIL_RE.match(line.strip())
        if match:
            warnings.append(f"MCP startup failed for {match.group(1)}: {match.group(2)}")
    preflight_warning = key_values.get("mcp_initialize_warning")
    if preflight_warning:
        warnings.append(f"MCP initialize preflight warning: {preflight_warning}")
    return warnings


def collect_errors(lines, result_status, result_reason):
    errors = []
    for line in lines:
        match = TOOL_STATUS_RE.match(line.strip())
        if match and match.group(3) == "failed":
            errors.append(f"{match.group(1)}.{match.group(2)} failed in {match.group(4)}{match.group(5)}")
    if result_status == "FAIL" and result_reason:
        errors.append(result_reason)
    return errors


def infer_unknown_reason(result, tool_calls, lines):
    if result["status"] != "UNKNOWN":
        return result["reason"]
    missing = []
    if not any(call["name"] == "requestable-execute" for call in tool_calls):
        missing.append("No runtime proof was captured.")
    if not any(call["name"] == "project-save" for call in tool_calls):
        missing.append("No save evidence was captured.")
    if not any(call["name"] in {"databaseobject-tree-apply", "batch-call"} for call in tool_calls):
        missing.append("No mutation evidence was captured.")
    if not missing:
        return result["reason"]
    return " ".join([result["reason"]] + missing if result["reason"] else missing)


def format_summary(report):
    outcome = report["result"]["status"]
    reason = report["result"]["reason"]
    role_prompt = report["rolePrompt"]["name"] or "none"
    scenario = report["scenario"]
    final_sections = report["finalOutput"]["sections"]
    runner_version = report["runner"]["version"] or "unknown"
    if runner_version.lower().startswith("codex-cli "):
        runner_label = runner_version
    else:
        runner_label = f"{report['runner']['name']} {runner_version}"
    evidence_lines = []

    for preferred in ("Contract", "Stub Status", "Contract Check", "Runtime Evidence", "Runtime Evidence Or Skip", "Findings"):
        text = final_sections.get(preferred)
        if text:
            first_line = next((line.strip() for line in text.splitlines() if line.strip()), "")
            if first_line:
                evidence_lines.append(f"- `{preferred}`: {first_line}")
        if len(evidence_lines) == 3:
            break

    if not evidence_lines:
        if outcome == "UNKNOWN":
            evidence_lines.append(f"- Missing proof: {reason}")
        else:
            evidence_lines.append("- No concise evidence block was extracted from the final output.")

    warning_error_lines = []
    for item in report["warnings"][:3]:
        warning_error_lines.append(f"- Warning: {item}")
    for item in report["errors"][:3]:
        warning_error_lines.append(f"- Error: {item}")
    if not warning_error_lines:
        warning_error_lines.append("- None")

    critique = report["finalOutput"]["mcpCritique"] or "None"

    return "\n".join(
        [
            "# Run",
            "",
            f"- `runId`: `{report['runId']}`",
            f"- `runner`: `{runner_label}`",
            f"- `provider/model`: `{report['provider'] or 'unknown'}` / `{report['model'] or 'unknown'}`",
            f"- `log`: `{report['artifacts']['logPath']}`",
            "",
            "# Outcome",
            "",
            f"- `status`: `{outcome}`",
            f"- `reason`: {reason or 'none'}",
            "",
            "# Role Prompt",
            "",
            f"- `name`: `{role_prompt}`",
            f"- `promptId`: `{report['rolePrompt']['promptId'] or 'none'}`",
            f"- `guideContext`: `{', '.join(report['guideContext']) if report['guideContext'] else 'none'}`",
            "",
            "# Scenario",
            "",
            f"- `promptFile`: `{scenario['promptFile'] or 'unknown'}`",
            f"- `runLabel`: `{scenario['runLabel'] or 'unknown'}`",
            f"- `task`: `{scenario['task'] or 'unknown'}`",
            "",
            "# Key Evidence",
            "",
            *evidence_lines,
            "",
            "# Warnings / Errors",
            "",
            *warning_error_lines,
            "",
            "# MCP Critique",
            "",
            f"- {critique}",
            "",
        ]
    )


def main():
    args = parse_args()
    log_path = Path(args.log).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    lines = log_path.read_text(encoding="utf-8").splitlines()
    key_values = parse_key_values(lines)
    header = parse_header(lines)

    role_prompt = default_role_prompt()
    role_prompt_metadata_raw = key_values.get("role_prompt_metadata_json")
    if role_prompt_metadata_raw:
        try:
            role_prompt = {**role_prompt, **json.loads(role_prompt_metadata_raw)}
        except json.JSONDecodeError:
            role_prompt["name"] = key_values.get("role_prompt_name")
    else:
        role_prompt = fetch_role_prompt_metadata(args.mcp_url, key_values.get("role_prompt_name"))
        if key_values.get("role_prompt_id") and not role_prompt.get("promptId"):
            role_prompt["promptId"] = key_values.get("role_prompt_id")
        if key_values.get("role_prompt_revision") not in {None, "", "none"} and role_prompt.get("revision") is None:
            try:
                role_prompt["revision"] = int(key_values["role_prompt_revision"])
            except ValueError:
                role_prompt["revision"] = None

    mcp_server = fetch_server_info(args.mcp_url)
    mcp_server_info_raw = key_values.get("mcp_server_info_json")
    if mcp_server_info_raw:
        try:
            parsed_server = json.loads(mcp_server_info_raw)
            mcp_server = {
                "name": parsed_server.get("name"),
                "title": parsed_server.get("title"),
                "version": parsed_server.get("version"),
                "url": key_values.get("mcp_url", args.mcp_url),
            }
        except json.JSONDecodeError:
            pass
    else:
        mcp_server["url"] = key_values.get("mcp_url", args.mcp_url)

    started_at = parse_iso_datetime(key_values.get("started_at"))
    finished_at = parse_iso_datetime(key_values.get("finished_at"))
    duration_ms = None
    if started_at and finished_at:
        duration_ms = int((finished_at - started_at).total_seconds() * 1000)

    tool_info = parse_tool_calls(lines)
    result, result_index = parse_result(lines)
    result["reason"] = infer_unknown_reason(result, tool_info["toolCalls"], lines)
    final_output = parse_sections(extract_final_output(lines, result_index))

    warnings = collect_warnings(lines)
    warnings.extend(tool_info["warnings"])
    errors = collect_errors(lines, result["status"], result["reason"])

    request_timeout = key_values.get("codex_request_timeout")
    try:
        request_timeout = int(request_timeout) if request_timeout not in {None, "", "default"} else None
    except ValueError:
        request_timeout = None

    report_path = out_dir / "report.json"
    summary_path = out_dir / "summary.md"

    report = {
        "schemaVersion": SCHEMA_VERSION,
        "runId": key_values.get("run_id") or log_path.stem,
        "startedAt": started_at.isoformat() if started_at else None,
        "finishedAt": finished_at.isoformat() if finished_at else None,
        "durationMs": duration_ms,
        "runner": {
            "name": "codex-cli",
            "version": key_values.get("codex_version"),
        },
        "provider": header.get("provider"),
        "model": header.get("model"),
        "reasoningEffort": header.get("reasoning effort") or key_values.get("codex_reasoning_effort"),
        "requestTimeoutSec": request_timeout,
        "scenario": {
            "promptFile": key_values.get("prompt_file"),
            "runLabel": key_values.get("run_label"),
            "benchmarkId": key_values.get("benchmark_id"),
            "task": key_values.get("run_label"),
            "suiteId": key_values.get("suite_id"),
            "candidateId": key_values.get("candidate_id"),
            "scenarioId": key_values.get("scenario_id"),
            "workspaceId": key_values.get("workspace_id"),
            "fixtureId": key_values.get("fixture_id"),
            "criticTargetRunId": key_values.get("critic_target_run_id"),
        },
        "rolePrompt": role_prompt,
        "guideContext": role_prompt.get("guideIds", []),
        "mcpServer": mcp_server,
        "result": result,
        "toolCalls": tool_info["toolCalls"],
        "toolStats": tool_info["toolStats"],
        "warnings": warnings,
        "errors": errors,
        "finalOutput": final_output,
        "artifacts": {
            "logPath": str(log_path),
            "reportPath": str(report_path),
            "summaryPath": str(summary_path),
        },
    }

    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    summary_path.write_text(format_summary(report), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
