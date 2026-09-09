#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from jsonschema import Draft202012Validator


SCHEMA_VERSION = "1.0.0"
DEFAULT_MCP_URL = os.environ.get("CONVERTIGO_MCP_URL", "http://localhost:18080/convertigo/api/mcp")
ROLE_PROMPT_NAME = "convertigo-critic"
ALLOWED_DISPOSITIONS = [
    "OPEN",
    "CLOSED_ALREADY_FIXED",
    "ROUTE_EXTERNAL",
    "DUPLICATE",
]
TARGET_REPOS = {"c8oprj-lib-c8o-mcp", "codex-cli-multiagent", "unknown"}


def repo_root():
    return Path(__file__).resolve().parents[2]


def optional_codex_multiagent_root():
    env_value = os.environ.get("CODEX_MULTIAGENT_ROOT", "").strip()
    if env_value:
        return Path(env_value).expanduser().resolve()
    sibling = repo_root().parent / "codex-cli-multiagent"
    return sibling if sibling.exists() else None


def parse_args():
    root = repo_root()
    parser = argparse.ArgumentParser(description="Consolidate raw field feedback into one reviewed triage batch.")
    parser.add_argument(
        "--inbox-root",
        default=str(root / "feedback" / "inbox"),
        help="Inbox root used when no explicit --report paths are provided.",
    )
    parser.add_argument(
        "--report",
        action="append",
        default=[],
        help="Explicit feedback report path. May be repeated.",
    )
    parser.add_argument(
        "--triage-root",
        default=str(root / "feedback" / "triage"),
        help="Runtime root for feedback triage batches.",
    )
    parser.add_argument(
        "--batch-id",
        default="",
        help="Optional explicit batch id. Defaults to feedback-triage-YYYYMMDDTHHMMSSZ.",
    )
    parser.add_argument(
        "--critic-timeout",
        type=int,
        default=900,
        help="Wall-clock timeout in seconds for the critic run.",
    )
    parser.add_argument(
        "--request-timeout",
        type=int,
        default=900,
        help="Codex request timeout forwarded to tests/run_prompt.sh.",
    )
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL, help="Convertigo MCP endpoint.")
    parser.add_argument(
        "--codex-bin",
        default=os.environ.get("CODEX_BIN", ""),
        help="Optional Codex binary override forwarded to tests/run_prompt.sh.",
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("CODEX_MODEL", ""),
        help="Optional model override forwarded to tests/run_prompt.sh.",
    )
    parser.add_argument(
        "--reasoning-effort",
        default=os.environ.get("CODEX_REASONING_EFFORT", ""),
        help="Optional reasoning effort override forwarded to tests/run_prompt.sh.",
    )
    return parser.parse_args()


def utc_now():
    return datetime.now(timezone.utc)


def iso_now():
    return utc_now().isoformat()


def default_batch_id():
    return "feedback-triage-" + utc_now().strftime("%Y%m%dT%H%M%SZ")


def slugify(text):
    return re.sub(r"[^A-Za-z0-9._-]+", "-", text).strip("-") or "item"


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def write_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def load_schema(path):
    return load_json(path)


def validate_payload(validator, payload, label):
    errors = sorted(validator.iter_errors(payload), key=lambda item: list(item.path))
    if errors:
        first = errors[0]
        where = ".".join(str(part) for part in first.path) or "<root>"
        raise RuntimeError(f"{label} failed schema validation at {where}: {first.message}")


def collect_report_paths(args):
    if args.report:
        return [Path(item).resolve() for item in args.report]
    inbox_root = Path(args.inbox_root).resolve()
    return sorted(inbox_root.glob("**/*.json"))


def joined_text(report):
    finding = report.get("finding", {})
    source = report.get("source", {})
    fields = [
        finding.get("area"),
        finding.get("subjectId"),
        finding.get("summary"),
        finding.get("evidence"),
        finding.get("suggestion"),
        source.get("project"),
        source.get("runMode"),
    ]
    return " ".join(item for item in fields if item).lower()


def infer_repo_hint(report):
    text = joined_text(report)
    if any(
        marker in text
        for marker in (
            "codex-cli-multiagent",
            "multiagent",
            "synchronized specialist agents",
            "synchronized role prompts",
            "planner-agent-handoff",
            "synced-prompts",
            "randomapp planner run",
        )
    ):
        return "codex-cli-multiagent"
    if report.get("finding", {}).get("area") in {"tool", "guide", "prompt", "scenario", "fixture"}:
        return "c8oprj-lib-c8o-mcp"
    return "unknown"


def existing_path(path_string):
    path = Path(path_string)
    return str(path.resolve()) if path.exists() else None


def find_resolved_parser_reports(root):
    reports = []
    campaigns_root = root / "tests" / "campaigns"
    for report_path in sorted(campaigns_root.glob("*/runs/*/*/report.json"), reverse=True):
        try:
            payload = load_json(report_path)
        except Exception:
            continue
        warnings = " ".join(payload.get("warnings", []))
        if "databaseobject-tree-apply" in warnings or "mobile-builder-open" in warnings:
            continue
        tool_names = {
            f"{item.get('server')}.{item.get('name')}"
            for item in payload.get("toolCalls", [])
        }
        if any(
            name.endswith(".databaseobject-tree-apply") or name.endswith(".mobile-builder-open")
            for name in tool_names
        ):
            reports.append(str(report_path.resolve()))
        if len(reports) == 2:
            break
    return reports


def derive_evidence_paths(root, report_path, report):
    subject_id = (report.get("finding", {}).get("subjectId") or "").lower()
    source_project = (report.get("source", {}).get("project") or "").lower()
    paths = [str(report_path)]
    candidates = []

    if subject_id == "parser-status-missing-tree-apply-mobile-builder-open":
        candidates.extend(
            [
                root / "tests" / "scripts" / "report_codex_run.py",
                root / "tests" / "scripts" / "score_campaign.py",
            ]
        )
        for resolved_report in find_resolved_parser_reports(root):
            if resolved_report not in paths:
                paths.append(resolved_report)
    if "uicustom" in subject_id or "frontend-ngx" in subject_id or "htmltemplate" in subject_id:
        candidates.extend(
            [
                root / "prompts" / "convertigo_frontend_ngx.md",
                root / "resources" / "convertigo_frontend_ngx.md",
                root / "tests" / "prompt_ngx_contract_probe.txt",
            ]
        )
    if (
        "planner-agent-handoff" in subject_id
        or "synced-prompts" in subject_id
        or "codex-cli-multiagent" in source_project
    ):
        external_root = optional_codex_multiagent_root()
        if external_root:
            candidates.extend(
                [
                    external_root / "AGENTS.md",
                    external_root / "learn.md",
                ]
            )

    for candidate in candidates:
        resolved = existing_path(str(candidate))
        if resolved and resolved not in paths:
            paths.append(resolved)
    return paths


def normalize_report(report_path, report):
    finding = report.get("finding", {})
    source = report.get("source", {})
    summary = {
        "reportId": report.get("reportId"),
        "sourcePath": str(report_path),
        "repoHint": infer_repo_hint(report),
        "finding": {
            "area": finding.get("area"),
            "subjectId": finding.get("subjectId"),
            "severity": finding.get("severity"),
            "summary": finding.get("summary"),
            "evidence": finding.get("evidence"),
            "suggestion": finding.get("suggestion"),
        },
        "source": {
            "serverVersion": source.get("serverVersion"),
            "projectVersion": source.get("projectVersion"),
            "rolePrompt": source.get("rolePrompt"),
            "project": source.get("project"),
            "runMode": source.get("runMode"),
            "runId": source.get("runId"),
            "provider": source.get("provider"),
            "model": source.get("model"),
        },
        "evidencePaths": derive_evidence_paths(repo_root(), report_path, report),
    }
    return summary


def packet_markdown(packet):
    counts = Counter(item["repoHint"] for item in packet["sourceReports"])
    lines = [
        "# Feedback Triage Packet",
        "",
        f"- `batchId`: `{packet['batchId']}`",
        f"- `createdAt`: `{packet['createdAt']}`",
        f"- `sourceReportCount`: `{packet['summary']['sourceReportCount']}`",
        f"- `repoHints`: `{json.dumps(dict(counts), ensure_ascii=True)}`",
        "",
        "## Source Reports",
        "",
    ]
    for item in packet["sourceReports"]:
        lines.extend(
            [
                f"### {item['reportId']}",
                "",
                f"- `sourcePath`: `{item['sourcePath']}`",
                f"- `repoHint`: `{item['repoHint']}`",
                f"- `area/subject`: `{item['finding']['area']}` / `{item['finding']['subjectId']}`",
                f"- `severity`: `{item['finding']['severity']}`",
                f"- `summary`: {item['finding']['summary']}",
                f"- `project`: `{item['source'].get('project') or 'none'}`",
                "",
                "Evidence paths:",
            ]
        )
        for evidence_path in item["evidencePaths"]:
            lines.append(f"- `{evidence_path}`")
        if item["finding"].get("evidence"):
            lines.extend(["", "Evidence excerpt:", "", item["finding"]["evidence"]])
        if item["finding"].get("suggestion"):
            lines.extend(["", "Suggestion excerpt:", "", item["finding"]["suggestion"]])
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def create_packet(report_paths, feedback_validator):
    source_reports = []
    for report_path in report_paths:
        payload = load_json(report_path)
        validate_payload(feedback_validator, payload, str(report_path))
        source_reports.append(normalize_report(report_path, payload))
    packet = {
        "schemaVersion": SCHEMA_VERSION,
        "batchId": "",
        "createdAt": iso_now(),
        "allowedDispositions": ALLOWED_DISPOSITIONS,
        "summary": {
            "sourceReportCount": len(source_reports),
            "byArea": dict(Counter(item["finding"]["area"] for item in source_reports)),
            "byRepoHint": dict(Counter(item["repoHint"] for item in source_reports)),
            "bySeverity": dict(Counter(item["finding"]["severity"] for item in source_reports)),
        },
        "sourceReports": source_reports,
    }
    return packet


def build_manifest(batch_id, batch_dir, packet_path, packet_md_path):
    return {
        "schemaVersion": SCHEMA_VERSION,
        "batchId": batch_id,
        "createdAt": iso_now(),
        "status": "PREPARED",
        "batchDir": str(batch_dir),
        "packetJson": str(packet_path),
        "packetMd": str(packet_md_path),
        "criticPrompt": None,
        "criticReport": None,
        "criticSummary": None,
        "consolidationJson": None,
        "consolidationMd": None,
    }


def render_prompt(template_path, packet_json_path, packet_md_path):
    template = template_path.read_text(encoding="utf-8")
    return (
        template.replace("__PACKET_JSON__", str(packet_json_path.resolve()))
        .replace("__PACKET_MD__", str(packet_md_path.resolve()))
    )


def run_command(args, env=None, cwd=None, timeout=None):
    return subprocess.run(args, env=env, cwd=cwd, text=True, capture_output=True, timeout=timeout)


def locate_single_artifact(batch_run_root, filename):
    matches = sorted(batch_run_root.glob(f"*/{filename}"))
    if len(matches) != 1:
        raise RuntimeError(f"Expected exactly one {filename} under {batch_run_root}, found {len(matches)}")
    return matches[0].resolve()


def extract_json_section(raw_text, section_name):
    if not raw_text:
        raise RuntimeError(f"Missing section: {section_name}")
    match = re.search(r"```(?:json)?\s*(.*?)```", raw_text, re.DOTALL)
    candidate = match.group(1) if match else raw_text
    return json.loads(candidate.strip())


def build_consolidation(batch_id, packet, critic_report):
    sections = critic_report.get("finalOutput", {}).get("sections", {})
    report_decisions = extract_json_section(sections.get("Report Decisions"), "Report Decisions")
    grouped_findings = extract_json_section(sections.get("Grouped Findings"), "Grouped Findings")

    if not isinstance(report_decisions, list):
        raise RuntimeError("Report Decisions must be a JSON array.")
    if not isinstance(grouped_findings, list):
        raise RuntimeError("Grouped Findings must be a JSON array.")

    packet_by_id = {item["reportId"]: item for item in packet["sourceReports"]}

    def normalize_disposition(value):
        mapping = {
            "SPLIT_REQUIRED": "OPEN",
            "DROP_NOISE": "DUPLICATE",
        }
        return mapping.get(value, value)

    def normalize_group_status(value):
        mapping = {
            "ROUTED": "ROUTE_EXTERNAL",
            "WATCH": "OPEN",
            "DROPPED": "DUPLICATE",
        }
        return mapping.get(value, value)

    seen_subjects = {}
    for decision in report_decisions:
        decision["disposition"] = normalize_disposition(decision.get("disposition"))
        packet_item = packet_by_id.get(decision.get("reportId"))
        subject_id = (((packet_item or {}).get("finding") or {}).get("subjectId") or "").strip()
        if subject_id and decision["disposition"] != "CLOSED_ALREADY_FIXED":
            if subject_id in seen_subjects:
                anchor_report_id = seen_subjects[subject_id]
                decision["disposition"] = "DUPLICATE"
                note = decision.get("notes") or ""
                duplicate_note = f"Duplicate source report for subjectId {subject_id}; consolidated under {anchor_report_id}."
                decision["notes"] = duplicate_note if not note else duplicate_note + " " + note
                decision["splitFindingIds"] = []
            else:
                seen_subjects[subject_id] = decision.get("reportId")

    for finding in grouped_findings:
        finding["status"] = normalize_group_status(finding.get("status"))

    resolved_parser_reports = find_resolved_parser_reports(repo_root())
    if resolved_parser_reports:
        for decision in report_decisions:
            packet_item = packet_by_id.get(decision.get("reportId"))
            subject_id = (((packet_item or {}).get("finding") or {}).get("subjectId") or "")
            if subject_id == "parser-status-missing-tree-apply-mobile-builder-open":
                decision["disposition"] = "CLOSED_ALREADY_FIXED"
                decision["targetRepo"] = "c8oprj-lib-c8o-mcp"
                decision["notes"] = (
                    "Current campaign reports show databaseobject-tree-apply/mobile-builder-open runs "
                    "without the old unresolved-status warning. Keep the broader parser backlog separate "
                    "from this already-fixed finding."
                )
                decision["splitFindingIds"] = []
        grouped_findings = [
            item
            for item in grouped_findings
            if item.get("subjectId") != "parser-status-missing-tree-apply-mobile-builder-open"
            and item.get("findingId") != "finding-parser-status-missing-terminal-status"
        ]

    decision_counts = dict(Counter(item.get("disposition", "unknown") for item in report_decisions))
    by_target_repo = dict(Counter(item.get("targetRepo", "unknown") for item in grouped_findings))

    consolidation = {
        "schemaVersion": SCHEMA_VERSION,
        "batchId": batch_id,
        "createdAt": iso_now(),
        "sourceReports": [
            {
                "reportId": item["reportId"],
                "sourcePath": item["sourcePath"],
            }
            for item in packet["sourceReports"]
        ],
        "summary": {
            "sourceReportCount": len(packet["sourceReports"]),
            "decisionCounts": decision_counts,
            "groupedFindingCount": len(grouped_findings),
            "byTargetRepo": by_target_repo,
        },
        "reportDecisions": report_decisions,
        "groupedFindings": grouped_findings,
    }
    return consolidation


def consolidation_markdown(consolidation):
    lines = [
        "# Feedback Consolidation",
        "",
        f"- `batchId`: `{consolidation['batchId']}`",
        f"- `createdAt`: `{consolidation['createdAt']}`",
        f"- `sourceReportCount`: `{consolidation['summary']['sourceReportCount']}`",
        f"- `groupedFindingCount`: `{consolidation['summary']['groupedFindingCount']}`",
        f"- `decisionCounts`: `{json.dumps(consolidation['summary']['decisionCounts'], ensure_ascii=True)}`",
        f"- `byTargetRepo`: `{json.dumps(consolidation['summary']['byTargetRepo'], ensure_ascii=True)}`",
        "",
        "## Report Decisions",
        "",
    ]
    for item in consolidation["reportDecisions"]:
        lines.append(
            f"- `{item['reportId']}` -> `{item['disposition']}` / `{item.get('targetRepo', 'unknown')}`: {item.get('notes', '')}"
        )
    lines.extend(["", "## Grouped Findings", ""])
    if consolidation["groupedFindings"]:
        for item in consolidation["groupedFindings"]:
            lines.append(
                f"- `{item['findingId']}` `{item['status']}` `{item['targetRepo']}` `{item['recommendedOwner']}` `{item['nextAction']}`: {item['symptom']}"
            )
    else:
        lines.append("- none")
    return "\n".join(lines) + "\n"


def main():
    args = parse_args()
    root = repo_root()
    feedback_schema = Draft202012Validator(load_schema(root / "review" / "schemas" / "feedback-report.schema.json"))
    packet_schema = Draft202012Validator(load_schema(root / "review" / "schemas" / "feedback-triage-packet.schema.json"))
    consolidation_schema = Draft202012Validator(load_schema(root / "review" / "schemas" / "feedback-consolidation.schema.json"))

    report_paths = collect_report_paths(args)
    if not report_paths:
        raise RuntimeError("No feedback reports found to triage.")

    packet = create_packet(report_paths, feedback_schema)
    batch_id = args.batch_id or default_batch_id()
    packet["batchId"] = batch_id

    batch_dir = Path(args.triage_root).resolve() / batch_id
    critic_dir = batch_dir / "critic"
    critic_run_root = critic_dir / "run"
    packet_path = batch_dir / "packet.json"
    packet_md_path = batch_dir / "packet.md"
    manifest_path = batch_dir / "manifest.json"
    critic_prompt_path = critic_dir / "prompt.txt"
    consolidation_json_path = batch_dir / "consolidation.json"
    consolidation_md_path = batch_dir / "consolidation.md"

    validate_payload(packet_schema, packet, "feedback triage packet")
    write_json(packet_path, packet)
    write_text(packet_md_path, packet_markdown(packet))

    manifest = build_manifest(batch_id, batch_dir, packet_path, packet_md_path)
    write_json(manifest_path, manifest)

    prompt_text = render_prompt(root / "tests" / "prompt_feedback_inbox_review.txt", packet_path, packet_md_path)
    write_text(critic_prompt_path, prompt_text)
    manifest["criticPrompt"] = str(critic_prompt_path)
    manifest["status"] = "CRITIC_RUNNING"
    write_json(manifest_path, manifest)

    env = os.environ.copy()
    env["ARTIFACT_DIR_ROOT"] = str(critic_run_root)
    env["MCP_URL"] = args.mcp_url
    env["RUN_STAMP"] = slugify(batch_id)
    env["CODEX_REQUEST_TIMEOUT"] = str(args.request_timeout)
    if args.codex_bin:
        env["CODEX_BIN"] = args.codex_bin
    if args.model:
        env["CODEX_MODEL"] = args.model
    if args.reasoning_effort:
        env["CODEX_REASONING_EFFORT"] = args.reasoning_effort

    run_result = run_command(
        [
            "bash",
            str((root / "tests" / "run_prompt.sh").resolve()),
            str(critic_prompt_path),
            "feedback_triage",
            ROLE_PROMPT_NAME,
        ],
        cwd=root,
        env=env,
        timeout=args.critic_timeout,
    )
    if run_result.returncode != 0:
        raise RuntimeError(
            "Feedback triage critic run failed:\n"
            + run_result.stdout[-4000:]
            + ("\n" + run_result.stderr[-4000:] if run_result.stderr else "")
        )

    critic_report_path = locate_single_artifact(critic_run_root, "report.json")
    critic_summary_path = locate_single_artifact(critic_run_root, "summary.md")
    manifest["criticReport"] = str(critic_report_path)
    manifest["criticSummary"] = str(critic_summary_path)

    critic_report = load_json(critic_report_path)
    consolidation = build_consolidation(batch_id, packet, critic_report)
    validate_payload(consolidation_schema, consolidation, "feedback consolidation")
    write_json(consolidation_json_path, consolidation)
    write_text(consolidation_md_path, consolidation_markdown(consolidation))

    manifest["consolidationJson"] = str(consolidation_json_path)
    manifest["consolidationMd"] = str(consolidation_md_path)
    manifest["status"] = "COMPLETED"
    write_json(manifest_path, manifest)

    print(f"BatchId: {batch_id}")
    print(f"Manifest: {manifest_path}")
    print(f"Packet JSON: {packet_path}")
    print(f"Packet MD: {packet_md_path}")
    print(f"Critic Report: {critic_report_path}")
    print(f"Critic Summary: {critic_summary_path}")
    print(f"Consolidation JSON: {consolidation_json_path}")
    print(f"Consolidation MD: {consolidation_md_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
