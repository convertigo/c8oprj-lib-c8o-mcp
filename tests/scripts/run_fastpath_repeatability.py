#!/usr/bin/env python3
import argparse
import json
import os
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

from validate_crud_tools import (
    DEFAULT_MCP_URL,
    ROOT,
    cleanup_project,
    docker_down,
    docker_up,
    load_spec,
    wait_for_mcp_ready,
)


ROLE_PROMPT_NAME = "convertigo-crud-fastpath"
DEFAULT_PROMPT_TEMPLATE = ROOT / "tests" / "prompt_crud_fastpath_repeatability.txt"
DEFAULT_ARTIFACTS_DIR = ROOT / "tests" / "reports" / "fastpath-repeatability" / time.strftime("%Y%m%d_%H%M%S")
RESULT_PASS_RE = re.compile(r"RESULT:\s*PASS")
RESULT_FAIL_RE = re.compile(r"RESULT:\s*FAIL")
SUPPORTED_DRIVERS = ("hsqldb", "postgresql", "mariadb")

DRIVER_CONFIG = {
    "hsqldb": {
        "label": "HSQLDB",
        "project_prefix": "FastpathHsql",
        "spec_path": ROOT / "tests" / "fixtures" / "crud" / "spec_hsqldb.json",
        "compose_path": None,
    },
    "postgresql": {
        "label": "PostgreSQL",
        "project_prefix": "FastpathPg",
        "spec_path": ROOT / "tests" / "fixtures" / "crud" / "spec_postgresql.json",
        "compose_path": ROOT / "tests" / "fixtures" / "crud" / "postgresql" / "docker-compose.yml",
    },
    "mariadb": {
        "label": "MariaDB",
        "project_prefix": "FastpathMaria",
        "spec_path": ROOT / "tests" / "fixtures" / "crud" / "spec_mariadb.json",
        "compose_path": ROOT / "tests" / "fixtures" / "crud" / "mariadb" / "docker-compose.yml",
    },
}


def parse_args():
    parser = argparse.ArgumentParser(description="Run a dedicated repeatability campaign for the mono-agent CRUD fast path.")
    parser.add_argument("--drivers", default="hsqldb,postgresql,mariadb")
    parser.add_argument("--runs-per-driver", type=int, default=3)
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL)
    parser.add_argument("--artifacts-dir", default=str(DEFAULT_ARTIFACTS_DIR))
    parser.add_argument("--cleanup-mode", choices=("keep-failures", "keep-all", "delete-all"), default="keep-failures")
    parser.add_argument("--prompt-template", default=str(DEFAULT_PROMPT_TEMPLATE))
    parser.add_argument("--scenario-timeout", type=int, default=1800)
    parser.add_argument("--request-timeout", type=int, default=900)
    parser.add_argument("--reasoning-effort", default="medium")
    parser.add_argument("--model", default="")
    parser.add_argument("--codex-bin", default="")
    return parser.parse_args()


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def parse_drivers(raw_value):
    drivers = []
    for item in str(raw_value or "").split(","):
        driver = item.strip().lower()
        if not driver:
            continue
        if driver not in SUPPORTED_DRIVERS:
            raise ValueError("Unsupported driver: " + driver)
        drivers.append(driver)
    if not drivers:
        raise ValueError("At least one driver is required")
    return drivers


def allocate_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def compose_project_name(driver, target_project):
    token = re.sub(r"[^a-z0-9]+", "", f"{driver}_{target_project}".lower())
    return token[:48] or "fastpathrepeatability"


def slugify(text, fallback="run"):
    cleaned = re.sub(r"[^a-z0-9]+", "_", str(text).lower()).strip("_")
    return cleaned or fallback


def parse_run_prompt_output(output_text):
    parsed = {}
    for line in output_text.splitlines():
        if line.startswith("RunId: "):
            parsed["runId"] = line.split(": ", 1)[1].strip()
        elif line.startswith("Log: "):
            parsed["logPath"] = line.split(": ", 1)[1].strip()
        elif line.startswith("Report: "):
            parsed["reportPath"] = line.split(": ", 1)[1].strip()
        elif line.startswith("Summary: "):
            parsed["summaryPath"] = line.split(": ", 1)[1].strip()
    return parsed


def truncate_text(value, limit=300):
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def ensure_dir(path):
    Path(path).mkdir(parents=True, exist_ok=True)


def render_prompt(template_path, output_path, replacements):
    text = Path(template_path).read_text(encoding="utf-8")
    for key, value in replacements.items():
        text = text.replace(key, value)
    unresolved = sorted(set(re.findall(r"__([A-Z0-9_]+)__", text)))
    if unresolved:
        raise ValueError("Unresolved placeholders after rendering: " + ", ".join("__" + name + "__" for name in unresolved))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text, encoding="utf-8")
    return output_path


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def prepare_spec(driver, target_project, allocated_port=None):
    spec = load_spec(DRIVER_CONFIG[driver]["spec_path"])
    spec["project"] = target_project
    if driver == "hsqldb":
        spec["database"]["database"] = target_project.lower()
        return spec

    base_db = slugify(spec["database"]["database"], "crud")
    db_suffix = slugify(target_project, "fastpath")[-24:]
    spec["database"]["database"] = (base_db + "_" + db_suffix)[:63]
    if allocated_port:
        spec["database"]["port"] = allocated_port
    return spec


def build_fixture_env(driver, spec, port, target_project):
    env = os.environ.copy()
    env["COMPOSE_PROJECT_NAME"] = compose_project_name(driver, target_project)
    if driver == "postgresql":
        env.update(
            {
                "POSTGRES_DB": spec["database"]["database"],
                "POSTGRES_USER": spec["database"]["user"],
                "POSTGRES_PASSWORD": spec["database"]["password"],
                "POSTGRES_PORT": str(port),
            }
        )
    elif driver == "mariadb":
        env.update(
            {
                "MARIADB_DATABASE": spec["database"]["database"],
                "MARIADB_ROOT_PASSWORD": spec["database"]["password"],
                "MARIADB_PORT": str(port),
            }
        )
    return env


def run_prompt(prompt_file, run_label, workspace_dir, artifact_dir_root, env_overrides, timeout_sec):
    env = os.environ.copy()
    env.update(env_overrides)
    env["WORKSPACE_DIR"] = str(workspace_dir)
    env["ARTIFACT_DIR_ROOT"] = str(artifact_dir_root)
    command = ["bash", "tests/run_prompt.sh", str(prompt_file), run_label, ROLE_PROMPT_NAME]
    try:
        result = subprocess.run(
            command,
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=timeout_sec,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError(f"run_prompt.sh timed out after {timeout_sec}s for {run_label}") from exc
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        raise RuntimeError(stderr or stdout or f"run_prompt.sh failed for {run_label}")
    parsed = parse_run_prompt_output(result.stdout)
    if not parsed.get("reportPath"):
        raise ValueError(f"run_prompt.sh did not print report path for {run_label}")
    parsed["stdout"] = result.stdout
    parsed["stderr"] = result.stderr
    return parsed


def validate_report(run_record, report):
    final_output = report.get("finalOutput", {}) or {}
    raw_text = str(final_output.get("rawText") or "")
    status = str((report.get("result") or {}).get("status") or "")
    target_project = run_record["targetProject"]

    for key in ("logPath", "reportPath", "summaryPath"):
        path_value = run_record.get(key)
        if not path_value or not Path(path_value).exists():
            return False, f"Missing artifact path: {key}"
    if status != "PASS":
        return False, f"report.result.status={status or 'missing'}"
    if not RESULT_PASS_RE.search(raw_text):
        return False, "Missing RESULT: PASS in final output"
    if RESULT_FAIL_RE.search(raw_text):
        return False, "Unexpected RESULT: FAIL in final output"
    if target_project not in raw_text:
        return False, f"Target project {target_project} missing from final output"
    return True, None


def failure_cause_for_exception(exc):
    if isinstance(exc, (json.JSONDecodeError, FileNotFoundError)):
        return "report_parse_error"
    message = str(exc)
    if "timed out" in message.lower():
        return "codex_timeout"
    if "Unresolved placeholders" in message:
        return "prompt_render_error"
    if "MCP endpoint did not become ready" in message:
        return "mcp_initialize_error"
    if "docker" in message.lower():
        return "fixture_error"
    if "report path" in message.lower() or "report.json" in message.lower():
        return "report_parse_error"
    return "runner_error"


def should_cleanup(run_status, cleanup_mode):
    if cleanup_mode == "delete-all":
        return True
    if cleanup_mode == "keep-all":
        return False
    return run_status == "PASS"


def relative_path(path, base_dir):
    try:
        return str(Path(path).resolve().relative_to(Path(base_dir).resolve()))
    except Exception:
        return str(path)


def driver_score(records, driver):
    relevant = [record for record in records if record["driver"] == driver]
    passed = sum(1 for record in relevant if record["status"] == "PASS")
    return passed, len(relevant)


def write_summary(output_dir, summary):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_json_path = output_dir / "summary.json"
    summary_md_path = output_dir / "summary.md"
    summary_json_path.write_text(json.dumps(summary, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    totals = summary["totals"]
    lines = [
        "# Fast Path Repeatability",
        "",
        f"- Started: `{summary['campaign']['startedAt']}`",
        f"- Finished: `{summary['campaign']['finishedAt']}`",
        f"- Role prompt: `{summary['campaign']['rolePromptName']}`",
        f"- Drivers: `{', '.join(summary['campaign']['drivers'])}`",
        f"- Runs per driver: `{summary['campaign']['runsPerDriver']}`",
        f"- Cleanup mode: `{summary['campaign']['cleanupMode']}`",
        f"- Global score: `{totals['passed']}/{totals['planned']}` PASS",
        "",
        "## Driver Scores",
        "",
    ]
    for driver in summary["campaign"]["drivers"]:
        score = totals["byDriver"][driver]
        lines.append(f"- `{driver}`: `{score['passed']}/{score['planned']}` PASS")
    lines.extend(
        [
            "",
            "## Runs",
            "",
            "| # | Driver | Project | Status | Cause | Duration | Report |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    for record in summary["runs"]:
        report_label = relative_path(record["reportPath"], output_dir) if record.get("reportPath") else "-"
        duration_value = record.get("durationMs")
        duration_label = f"{duration_value} ms" if isinstance(duration_value, int) else "-"
        lines.append(
            "| {index} | {driver} | `{project}` | `{status}` | `{cause}` | {duration} | `{report}` |".format(
                index=record["sequenceNumber"],
                driver=record["driver"],
                project=record["targetProject"],
                status=record["status"],
                cause=record.get("failureCause") or "-",
                duration=duration_label,
                report=report_label,
            )
        )
    failures = [record for record in summary["runs"] if record["status"] != "PASS"]
    if failures:
        lines.extend(["", "## Failures", ""])
        for record in failures:
            lines.append(
                "- `{driver}` run `{run}` on `{project}`: `{cause}`. {detail}".format(
                    driver=record["driver"],
                    run=record["runLabel"],
                    project=record["targetProject"],
                    cause=record.get("failureCause") or "unknown",
                    detail=record.get("failureDetail") or "No detail.",
                )
            )
    summary_md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_target_project(driver, run_index):
    stamp = time.strftime("%Y%m%d_%H%M%S")
    prefix = DRIVER_CONFIG[driver]["project_prefix"]
    return f"{prefix}_{run_index:02d}_{stamp}"


def build_run_env(args, target_project, run_stamp):
    env = {
        "MCP_URL": args.mcp_url,
        "TARGET_PROJECT": target_project,
        "RUN_STAMP": run_stamp,
        "CODEX_REASONING_EFFORT": args.reasoning_effort,
        "CODEX_REQUEST_TIMEOUT": str(args.request_timeout),
    }
    if args.model:
        env["CODEX_MODEL"] = args.model
    if args.codex_bin:
        env["CODEX_BIN"] = args.codex_bin
    return env


def run_one(args, output_dir, sequence_number, driver, run_index):
    target_project = build_target_project(driver, run_index)
    run_stamp = time.strftime("%Y%m%d_%H%M%S")
    run_label = f"fastpath_{driver}_{run_index:02d}"
    prompt_dir = output_dir / "prompts"
    workspace_dir = output_dir / "workspaces" / run_label
    runs_dir = output_dir / "runs"
    record = {
        "sequenceNumber": sequence_number,
        "driver": driver,
        "driverLabel": DRIVER_CONFIG[driver]["label"],
        "runIndex": run_index,
        "runLabel": run_label,
        "targetProject": target_project,
        "status": "FAIL",
        "failureCause": None,
        "failureDetail": None,
        "reportStatus": None,
        "durationMs": None,
        "startedAt": now_iso(),
        "finishedAt": None,
        "promptPath": None,
        "workspacePath": str(workspace_dir.resolve()),
        "logPath": None,
        "reportPath": None,
        "summaryPath": None,
        "projectCleanup": {
            "attempted": False,
            "deleted": False,
            "retained": False,
            "warning": None,
        },
        "fixture": {
            "driver": driver,
            "enabled": driver != "hsqldb",
            "port": None,
            "composeProjectName": None,
            "composePath": str(DRIVER_CONFIG[driver]["compose_path"]) if DRIVER_CONFIG[driver]["compose_path"] else None,
            "started": False,
            "tornDown": False,
            "warning": None,
        },
    }

    fixture_env = None
    started_monotonic = time.time()
    try:
        wait_for_mcp_ready(args.mcp_url, timeout=90)

        allocated_port = None
        if driver != "hsqldb":
            allocated_port = allocate_port()
        spec = prepare_spec(driver, target_project, allocated_port)
        if driver != "hsqldb":
            fixture_env = build_fixture_env(driver, spec, allocated_port, target_project)
            record["fixture"]["port"] = allocated_port
            record["fixture"]["composeProjectName"] = fixture_env["COMPOSE_PROJECT_NAME"]
            docker_up(DRIVER_CONFIG[driver]["compose_path"], fixture_env)
            record["fixture"]["started"] = True

        prompt_path = render_prompt(
            Path(args.prompt_template),
            prompt_dir / f"{run_label}.txt",
            {
                "__TARGET_PROJECT__": target_project,
                "__CRUD_SPEC_JSON__": json.dumps(spec, indent=2, ensure_ascii=True),
            },
        )
        record["promptPath"] = str(prompt_path.resolve())

        cleanup_project(args.mcp_url, target_project)
        run_data = run_prompt(
            prompt_path,
            run_label,
            workspace_dir,
            runs_dir,
            build_run_env(args, target_project, run_stamp),
            args.scenario_timeout,
        )
        record["runId"] = run_data.get("runId")
        record["logPath"] = run_data.get("logPath")
        record["reportPath"] = run_data.get("reportPath")
        record["summaryPath"] = run_data.get("summaryPath")

        report = load_json(record["reportPath"])
        record["reportStatus"] = str((report.get("result") or {}).get("status") or "")
        record["durationMs"] = report.get("durationMs")

        valid, validation_detail = validate_report(record, report)
        if not valid:
            record["failureCause"] = "result_fail"
            record["failureDetail"] = validation_detail
        else:
            record["status"] = "PASS"
            record["failureCause"] = None
            record["failureDetail"] = None
    except Exception as exc:
        record["failureCause"] = failure_cause_for_exception(exc)
        record["failureDetail"] = truncate_text(str(exc), 400)
    finally:
        record["durationMs"] = record["durationMs"] or int(round((time.time() - started_monotonic) * 1000))
        if fixture_env is not None:
            try:
                docker_down(DRIVER_CONFIG[driver]["compose_path"], fixture_env)
                record["fixture"]["tornDown"] = True
            except Exception as exc:
                record["fixture"]["warning"] = truncate_text(str(exc), 300)
                if record["failureCause"] is None:
                    record["failureCause"] = "fixture_error"
                    record["failureDetail"] = "Fixture teardown failed: " + truncate_text(str(exc), 250)
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
    return record


def initial_summary(args, drivers):
    return {
        "campaign": {
            "startedAt": now_iso(),
            "finishedAt": None,
            "mcpUrl": args.mcp_url,
            "rolePromptName": ROLE_PROMPT_NAME,
            "promptTemplate": str(Path(args.prompt_template).resolve()),
            "artifactsDir": str(Path(args.artifacts_dir).resolve()),
            "drivers": drivers,
            "runsPerDriver": args.runs_per_driver,
            "cleanupMode": args.cleanup_mode,
            "scenarioTimeoutSec": args.scenario_timeout,
            "requestTimeoutSec": args.request_timeout,
            "reasoningEffort": args.reasoning_effort,
            "model": args.model or None,
            "codexBin": args.codex_bin or None,
        },
        "totals": {
            "planned": len(drivers) * args.runs_per_driver,
            "completed": 0,
            "passed": 0,
            "failed": 0,
            "byDriver": {
                driver: {
                    "planned": args.runs_per_driver,
                    "completed": 0,
                    "passed": 0,
                    "failed": 0,
                }
                for driver in drivers
            },
        },
        "runs": [],
    }


def refresh_totals(summary):
    summary["totals"]["completed"] = len(summary["runs"])
    summary["totals"]["passed"] = sum(1 for record in summary["runs"] if record["status"] == "PASS")
    summary["totals"]["failed"] = sum(1 for record in summary["runs"] if record["status"] != "PASS")
    for driver in summary["campaign"]["drivers"]:
        passed, _ = driver_score(summary["runs"], driver)
        completed = len([record for record in summary["runs"] if record["driver"] == driver])
        summary["totals"]["byDriver"][driver]["planned"] = summary["campaign"]["runsPerDriver"]
        summary["totals"]["byDriver"][driver]["completed"] = completed
        summary["totals"]["byDriver"][driver]["passed"] = passed
        summary["totals"]["byDriver"][driver]["failed"] = completed - passed


def main():
    args = parse_args()
    drivers = parse_drivers(args.drivers)
    output_dir = Path(args.artifacts_dir)
    ensure_dir(output_dir)
    ensure_dir(output_dir / "prompts")
    ensure_dir(output_dir / "workspaces")
    ensure_dir(output_dir / "runs")

    summary = initial_summary(args, drivers)
    write_summary(output_dir, summary)

    sequence_number = 1
    for driver in drivers:
        for run_index in range(1, args.runs_per_driver + 1):
            print(f"[fastpath-repeatability] start driver={driver} run={run_index}/{args.runs_per_driver}", flush=True)
            record = run_one(args, output_dir, sequence_number, driver, run_index)
            summary["runs"].append(record)
            refresh_totals(summary)
            write_summary(output_dir, summary)
            print(
                "[fastpath-repeatability] completed driver={driver} run={run} status={status} cause={cause}".format(
                    driver=driver,
                    run=run_index,
                    status=record["status"],
                    cause=record.get("failureCause") or "-",
                ),
                flush=True,
            )
            sequence_number += 1

    summary["campaign"]["finishedAt"] = now_iso()
    refresh_totals(summary)
    write_summary(output_dir, summary)

    summary_json = output_dir / "summary.json"
    summary_md = output_dir / "summary.md"
    print(f"SummaryJson: {summary_json}", flush=True)
    print(f"SummaryMd: {summary_md}", flush=True)

    if summary["totals"]["failed"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
