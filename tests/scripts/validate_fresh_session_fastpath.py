#!/usr/bin/env python3
import argparse
from datetime import datetime
import json
import re
import time
from pathlib import Path

from run_fastpath_repeatability import (
    ROLE_PROMPT_NAME,
    build_run_env,
    load_json,
    render_prompt,
    run_prompt,
    truncate_text,
    validate_report,
)
from validate_crud_tools import DEFAULT_MCP_URL, ROOT, cleanup_project, load_spec, purge_test_projects, wait_for_mcp_ready


DEFAULT_PROMPT_TEMPLATE = ROOT / "tests" / "prompt_crud_fastpath_fresh_session.txt"
DEFAULT_SPEC_PATH = ROOT / "tests" / "fixtures" / "crud" / "spec_poll_hsqldb.json"
DEFAULT_OUTPUT_DIR = ROOT / "tests" / "reports" / "fresh-session-fastpath" / time.strftime("%Y%m%d_%H%M%S")
TOOL_CALL_RE = re.compile(r"^tool ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\((.*)\)$")
SESSION_ID_RE = re.compile(r"^session id:\s*([a-z0-9-]+)\s*$", re.IGNORECASE)
POST_GREEN_MUTATING_TOOLS = {
    "marketplace-import",
    "upsert-crud",
    "upsert-ngx-crud-kit",
    "databaseobject-tree-apply",
    "batch-call",
    "requestable-execute",
    "project-delete",
    "project-reload",
    "project-js-set",
    "requestable-stub-set",
}


def parse_args():
    parser = argparse.ArgumentParser(description="Validate that a fresh empty-dir codex run enters the CRUD fast path through the expected discovery rail.")
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL)
    parser.add_argument("--artifacts-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--prompt-template", default=str(DEFAULT_PROMPT_TEMPLATE))
    parser.add_argument("--spec-path", default=str(DEFAULT_SPEC_PATH))
    parser.add_argument("--target-project", default="")
    parser.add_argument("--cleanup-mode", choices=("keep-failures", "keep-all", "delete-all"), default="keep-failures")
    parser.add_argument("--scenario-timeout", type=int, default=1800)
    parser.add_argument("--request-timeout", type=int, default=900)
    parser.add_argument("--reasoning-effort", default="medium")
    parser.add_argument("--model", default="")
    parser.add_argument("--codex-bin", default="")
    return parser.parse_args()


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def build_target_project(explicit_name=""):
    if explicit_name:
        return explicit_name
    return "FreshSessionFastpath_%s" % time.strftime("%Y%m%d_%H%M%S")


def should_cleanup(run_status, cleanup_mode):
    if cleanup_mode == "delete-all":
        return True
    if cleanup_mode == "keep-all":
        return False
    return run_status == "PASS"


def parse_tool_calls(log_path, report_path=None):
    raw_events = []
    lines = Path(log_path).read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines, start=1):
        match = TOOL_CALL_RE.match(line.strip())
        if not match:
            continue
        args = None
        raw_args = match.group(3)
        try:
          args = json.loads(raw_args)
        except Exception:
          args = {"_raw": raw_args}
        raw_events.append(
            {
                "line": index,
                "server": match.group(1),
                "name": match.group(2),
                "args": args,
            }
        )
    if not report_path:
        return raw_events

    try:
        report = load_json(report_path)
    except Exception:
        return raw_events

    tool_calls = report.get("toolCalls") or []
    if not tool_calls:
        return raw_events

    raw_by_signature = {}
    for event in raw_events:
        signature = (event["server"], event["name"])
        raw_by_signature.setdefault(signature, []).append(event)

    raw_index_by_signature = {}
    ordered_events = []
    for index, tool_call in enumerate(tool_calls, start=1):
        server = tool_call.get("server") or ""
        name = tool_call.get("name") or tool_call.get("tool") or ""
        signature = (server, name)
        raw_list = raw_by_signature.get(signature) or []
        raw_offset = raw_index_by_signature.get(signature, 0)
        raw_event = raw_list[raw_offset] if raw_offset < len(raw_list) else None
        if raw_event is not None:
            raw_index_by_signature[signature] = raw_offset + 1
        ordered_events.append(
            {
                "line": index,
                "server": server,
                "name": name,
                "args": raw_event["args"] if raw_event is not None else {},
            }
        )
    return ordered_events


def extract_session_id(log_path):
    for line in Path(log_path).read_text(encoding="utf-8").splitlines():
        match = SESSION_ID_RE.match(line.strip())
        if match:
            return match.group(1)
    return ""


def locate_session_trace(session_id):
    if not session_id:
        return None
    matches = sorted((Path.home() / ".codex" / "sessions").rglob(f"*{session_id}.jsonl"))
    return matches[-1] if matches else None


def load_session_trace(trace_path):
    events = []
    if not trace_path or not Path(trace_path).exists():
        return events
    for line in Path(trace_path).read_text(encoding="utf-8", errors="ignore").splitlines():
        text = line.strip()
        if not text:
            continue
        try:
            events.append(json.loads(text))
        except Exception:
            continue
    return events


def parse_trace_timestamp(value):
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except Exception:
        return None


def parse_trace_tool_calls(trace_events):
    results = []
    for event in trace_events:
        payload = event.get("payload") or {}
        if event.get("type") != "response_item" or payload.get("type") != "function_call":
            continue
        name = str(payload.get("name") or "")
        args = payload.get("arguments")
        try:
            parsed_args = json.loads(args) if args else {}
        except Exception:
            parsed_args = {"_raw": args}
        results.append(
            {
                "timestamp": parse_trace_timestamp(event.get("timestamp")),
                "name": name,
                "args": parsed_args,
            }
        )
    return results


def inspect_session_trace(trace_events, workspace_path):
    workspace = str(Path(workspace_path).resolve())
    violations = []
    for event in trace_events:
        payload = event.get("payload") or {}
        event_type = payload.get("type")
        name = payload.get("name") or ""
        if event_type == "function_call" and name == "exec_command":
            try:
                arguments = json.loads(payload.get("arguments") or "{}")
            except Exception:
                arguments = {}
            cmd = str(arguments.get("cmd") or "")
            workdir = str(arguments.get("workdir") or "")
            lowered = cmd.lower()
            if workspace and workdir == workspace and ("pwd" in lowered or "rg --files" in lowered or re.search(r"(^|\s)ls(\s|$)", lowered)):
                violations.append(f"Forbidden shell workspace inspection in empty MCP-only workspace: {cmd}")
            if "_private/ionic" in cmd or "_private/ionic" in workdir:
                violations.append(f"Forbidden generated runtime access via exec_command: {cmd or workdir}")
            if "displayobjects" in lowered or "displayobjects" in workdir.lower():
                violations.append(f"Forbidden generated DisplayObjects access via exec_command: {cmd or workdir}")
            if "npm run build" in lowered or "ionic build" in lowered or "ng build" in lowered:
                violations.append(f"Forbidden manual frontend build outside MCP: {cmd}")
        elif event_type == "custom_tool_call" and name == "apply_patch":
            patch_text = str(payload.get("input") or "")
            if "_private/ionic" in patch_text or "DisplayObjects" in patch_text:
                violations.append("Forbidden patch on generated frontend artifacts detected in session trace.")
    return violations


def read_nested_spec(raw_spec):
    current = raw_spec
    for _ in range(3):
        if isinstance(current, str):
            try:
                current = json.loads(current)
                continue
            except Exception:
                return None
        break
    return current if isinstance(current, dict) else None


def is_seed_enabled(spec):
    if not isinstance(spec, dict):
        return False
    seed = spec.get("seed")
    if not isinstance(seed, dict):
        return False
    return bool(seed.get("enabled"))


def has_explicit_relations(spec):
    if not isinstance(spec, dict):
        return False
    relations = spec.get("relations")
    return isinstance(relations, list) and any(isinstance(item, dict) for item in relations)


def first_event(events, predicate):
    for event in events:
        if predicate(event):
            return event
    return None


def event_label(event):
    if not event:
        return "-"
    return f"{event['server']}.{event['name']}@L{event['line']}"


def require_event(events, predicate, message):
    event = first_event(events, predicate)
    if not event:
        raise RuntimeError(message)
    return event


def require_before(left_event, right_event, message):
    if not left_event or not right_event or left_event["line"] >= right_event["line"]:
        raise RuntimeError(message)


def check_call_order(events):
    discovery = {}
    discovery["capabilities"] = require_event(
        events,
        lambda event: event["server"] == "convertigo" and event["name"] == "read_mcp_resource" and str((event["args"] or {}).get("uri") or "") == "convertigo://capabilities",
        "Fresh session did not read convertigo://capabilities.",
    )
    discovery["fastPathGuide"] = require_event(
        events,
        lambda event: event["server"] == "convertigo" and event["name"] == "read_mcp_resource" and str((event["args"] or {}).get("uri") or "") == "convertigo://resources/convertigo-crud-fastpath",
        "Fresh session did not read convertigo://resources/convertigo-crud-fastpath.",
    )
    redundant_bootstrap = first_event(
        events,
        lambda event: (
            event["server"] in ("convertigo", "codex")
            and event["name"] in ("list_mcp_resources", "list_mcp_resource_templates", "list_mcp_prompts")
        ) or (
            event["server"] == "convertigo"
            and event["name"] == "read_mcp_resource"
            and str((event["args"] or {}).get("uri") or "") in (
                "convertigo://recipes/quickstart",
                "convertigo://resources/convertigo-start",
                "convertigo://resources/convertigo-platform-big-picture",
            )
        ),
    )
    if redundant_bootstrap:
        raise RuntimeError(
            "Known CRUD route replayed broad discovery instead of reading its entry recipe directly: %s."
            % event_label(redundant_bootstrap)
        )

    workflow = {}
    workflow["marketplaceImport"] = require_event(
        events,
        lambda event: event["server"] == "convertigo" and event["name"] == "marketplace-import",
        "Run never called marketplace-import for the starter project.",
    )
    mobile_builder_events = [
        event for event in events
        if event["server"] == "convertigo" and event["name"] == "mobile-builder-open"
    ]
    if len(mobile_builder_events) < 2:
        raise RuntimeError("Run did not call mobile-builder-open twice (starter + post-bootstrap).")
    workflow["starterViewer"] = mobile_builder_events[0]
    workflow["upsertCrud"] = require_event(
        events,
        lambda event: event["server"] == "convertigo" and event["name"] == "upsert-crud",
        "Run never called upsert-crud.",
    )
    workflow["backendProof"] = require_event(
        events,
        lambda event: event["server"] == "convertigo" and event["name"] == "crud-proof" and not bool((event["args"] or {}).get("expectUiShell")),
        "Run never called backend crud-proof.",
    )
    workflow["bootstrapUi"] = require_event(
        events,
        lambda event: event["server"] == "convertigo" and event["name"] == "upsert-ngx-crud-kit" and str((event["args"] or {}).get("stage") or "") == "bootstrap",
        "Run never called upsert-ngx-crud-kit stage=bootstrap.",
    )
    workflow["mobileBuilder"] = require_event(
        mobile_builder_events,
        lambda event: event["line"] > workflow["bootstrapUi"]["line"],
        "Run never called mobile-builder-open after stage=bootstrap.",
    )
    workflow["finalUi"] = require_event(
        events,
        lambda event: event["server"] == "convertigo" and event["name"] == "upsert-ngx-crud-kit" and str((event["args"] or {}).get("stage") or "") == "final",
        "Run never called upsert-ngx-crud-kit stage=final.",
    )
    workflow["finalProof"] = require_event(
        events,
        lambda event: event["server"] == "convertigo" and event["name"] == "crud-proof" and bool((event["args"] or {}).get("expectUiShell")),
        "Run never called final crud-proof expectUiShell=true.",
    )

    for key in ("capabilities", "fastPathGuide"):
        require_before(discovery[key], workflow["marketplaceImport"], f"{key} happened after marketplace-import.")

    rag_before_discovery = first_event(
        events,
        lambda event: event["server"] == "convertigo" and event["name"] == "rag-query" and event["line"] < workflow["marketplaceImport"]["line"],
    )
    if rag_before_discovery:
        raise RuntimeError("Fresh session called rag-query before completing the fast-path guide read sequence.")

    rag_after_fastpath = first_event(
        events,
        lambda event: event["server"] == "convertigo" and event["name"] == "rag-query" and event["line"] > discovery["fastPathGuide"]["line"],
    )
    if rag_after_fastpath:
        raise RuntimeError("Fresh session called rag-query after the CRUD fast path had already been selected.")

    project_list_before_guides = first_event(
        events,
        lambda event: event["server"] == "convertigo" and event["name"] == "project-list" and event["line"] < discovery["fastPathGuide"]["line"],
    )
    if project_list_before_guides:
        raise RuntimeError("Fresh session called project-list before reading the fast-path guide.")

    require_before(workflow["marketplaceImport"], workflow["starterViewer"], "The starter viewer was opened before marketplace-import.")
    require_before(workflow["starterViewer"], workflow["upsertCrud"], "upsert-crud happened before the starter viewer was opened.")
    require_before(workflow["upsertCrud"], workflow["backendProof"], "Backend crud-proof happened before upsert-crud.")
    require_before(workflow["backendProof"], workflow["bootstrapUi"], "Bootstrap UI happened before backend proof.")
    require_before(workflow["bootstrapUi"], workflow["mobileBuilder"], "mobile-builder-open happened before stage=bootstrap.")
    require_before(workflow["mobileBuilder"], workflow["finalUi"], "Final UI apply happened before mobile-builder-open.")
    require_before(workflow["finalUi"], workflow["finalProof"], "Final crud-proof happened before stage=final.")

    final_args = workflow["finalProof"]["args"] or {}
    if not str(final_args.get("viewerUrl") or "").strip():
        raise RuntimeError("Final crud-proof did not receive viewerUrl from mobile-builder-open.")

    upsert_spec = read_nested_spec((workflow["upsertCrud"]["args"] or {}).get("spec"))
    if not is_seed_enabled(upsert_spec):
        raise RuntimeError("Fresh session did not pass seeded demo data in the initial upsert-crud spec.")
    if not has_explicit_relations(upsert_spec):
        raise RuntimeError("Fresh session did not pass explicit relations[] in the initial upsert-crud spec.")

    post_green_mutation = first_event(
        events,
        lambda event: event["line"] > workflow["finalProof"]["line"]
        and event["server"] == "convertigo"
        and event["name"] in POST_GREEN_MUTATING_TOOLS,
    )
    if post_green_mutation:
        raise RuntimeError(
            "Fresh session kept mutating the project after the first green final crud-proof: %s."
            % event_label(post_green_mutation)
        )

    return {
        "discovery": {key: {"label": event_label(value), "line": value["line"] if value else None} for key, value in discovery.items()},
        "workflow": {key: {"label": event_label(value), "line": value["line"]} for key, value in workflow.items()},
    }


def compute_time_to_first_green(trace_events):
    tool_calls = parse_trace_tool_calls(trace_events)
    if not tool_calls:
        return None
    start_time = None
    first_green_time = None
    for event in tool_calls:
        if start_time is None and event.get("timestamp") is not None:
            start_time = event["timestamp"]
        name = str(event.get("name") or "")
        if name in ("mcp__convertigo__crud-proof", "mcp__convertigo__crud_proof") and bool((event["args"] or {}).get("expectUiShell")):
            first_green_time = event.get("timestamp")
            break
    if not start_time or not first_green_time:
        return None
    return int((first_green_time - start_time).total_seconds() * 1000)


def write_summary(output_dir, record):
    output_dir = Path(output_dir)
    summary_json = output_dir / "summary.json"
    summary_md = output_dir / "summary.md"
    summary_json.write_text(json.dumps(record, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    lines = [
        "# Fresh Session Fast Path",
        "",
        f"- Started: `{record['startedAt']}`",
        f"- Finished: `{record['finishedAt']}`",
        f"- Target project: `{record['targetProject']}`",
        f"- Status: `{record['status']}`",
        f"- Time to first green: `{record.get('timeToFirstGreenMs', '-')}`",
        f"- Failure cause: `{record.get('failureCause') or '-'}`",
        f"- Report: `{record.get('reportPath') or '-'}`",
        f"- Raw log: `{record.get('logPath') or '-'}`",
        "",
        "## Discovery order",
        "",
    ]
    order = record.get("callOrder") or {}
    for section in ("discovery", "workflow"):
        lines.append(f"### {section}")
        lines.append("")
        for key, value in (order.get(section) or {}).items():
            lines.append(f"- `{key}`: `{value['label']}`")
        lines.append("")
    if record.get("failureDetail"):
        lines.extend(["## Failure", "", f"- {record['failureDetail']}", ""])
    summary_md.write_text("\n".join(lines), encoding="utf-8")


def main():
    args = parse_args()
    output_dir = Path(args.artifacts_dir)
    prompt_dir = output_dir / "prompts"
    workspace_dir = output_dir / "workspace"
    runs_dir = output_dir / "runs"
    output_dir.mkdir(parents=True, exist_ok=True)

    target_project = build_target_project(args.target_project)
    record = {
        "startedAt": now_iso(),
        "finishedAt": None,
        "rolePromptName": ROLE_PROMPT_NAME,
        "targetProject": target_project,
        "status": "FAIL",
        "failureCause": None,
        "failureDetail": None,
        "promptPath": None,
        "workspacePath": str(workspace_dir.resolve()),
        "logPath": None,
        "reportPath": None,
        "summaryPath": None,
        "callOrder": {},
        "deletedProjects": [],
        "projectCleanup": {"attempted": False, "deleted": False, "retained": False, "warning": None},
    }

    started = time.time()
    try:
        wait_for_mcp_ready(args.mcp_url, timeout=90)
        record["deletedProjects"] = purge_test_projects(args.mcp_url, exclude=[target_project])
        spec = load_spec(args.spec_path)
        spec["project"] = target_project
        spec["database"]["database"] = target_project.lower()
        prompt_path = render_prompt(
            Path(args.prompt_template),
            prompt_dir / "fresh_session_fastpath.txt",
            {
                "__TARGET_PROJECT__": target_project,
                "__CRUD_SPEC_JSON__": json.dumps(spec, indent=2, ensure_ascii=True),
            },
        )
        record["promptPath"] = str(prompt_path.resolve())
        cleanup_project(args.mcp_url, target_project)
        run_data = run_prompt(
            prompt_path,
            "fresh_session_fastpath",
            workspace_dir,
            runs_dir,
            build_run_env(args, target_project, time.strftime("%Y%m%d_%H%M%S")),
            args.scenario_timeout,
        )
        record["runId"] = run_data.get("runId")
        record["logPath"] = run_data.get("logPath")
        record["reportPath"] = run_data.get("reportPath")
        record["summaryPath"] = run_data.get("summaryPath")

        report = load_json(record["reportPath"])
        valid, detail = validate_report({"targetProject": target_project, **record}, report)
        if not valid:
            raise RuntimeError(detail)

        events = parse_tool_calls(record["logPath"], record["reportPath"])
        record["callOrder"] = check_call_order(events)
        session_id = extract_session_id(record["logPath"])
        session_trace = locate_session_trace(session_id)
        record["sessionId"] = session_id or None
        record["sessionTracePath"] = str(session_trace.resolve()) if session_trace else None
        trace_violations = inspect_session_trace(load_session_trace(session_trace), workspace_dir)
        if trace_violations:
            raise RuntimeError("; ".join(trace_violations))
        time_to_first_green = compute_time_to_first_green(load_session_trace(session_trace))
        if time_to_first_green is not None:
            record["timeToFirstGreenMs"] = time_to_first_green
        record["status"] = "PASS"
    except Exception as exc:
        message = str(exc)
        record["failureCause"] = "entry_validation_error"
        record["failureDetail"] = truncate_text(message, 500)
    finally:
        record["durationMs"] = int(round((time.time() - started) * 1000))
        if should_cleanup(record["status"], args.cleanup_mode):
            record["projectCleanup"]["attempted"] = True
            try:
                cleanup_project(args.mcp_url, target_project)
                record["projectCleanup"]["deleted"] = True
            except Exception as exc:
                record["projectCleanup"]["warning"] = truncate_text(str(exc), 300)
        else:
            record["projectCleanup"]["retained"] = True
        record["finishedAt"] = now_iso()
        write_summary(output_dir, record)

    if record["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
