#!/usr/bin/env python3
import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path


SCHEMA_VERSION = "1.0.0"


def parse_args():
    parser = argparse.ArgumentParser(description="Score one Phase 4 benchmark campaign.")
    parser.add_argument("--campaign-dir", required=True, help="Path to the campaign directory.")
    parser.add_argument("--suite", required=True, help="Path to the benchmark suite manifest.")
    return parser.parse_args()


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, payload):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def normalize_text(value):
    return re.sub(r"\s+", " ", value or "").strip().lower()


def contains_any(text, tokens):
    haystack = normalize_text(text)
    return any(normalize_text(token) in haystack for token in tokens)


def has_save_evidence(report):
    return any(call["name"] == "project-save" and call["status"] == "success" for call in report["toolCalls"]) or contains_any(
        report["finalOutput"]["rawText"],
        [
            "saved:",
            "project-save",
            "saved project",
            "no save was needed",
            "no save needed",
            "reused unchanged",
            "existing implementation was reused unchanged",
        ],
    )


def has_runtime_evidence(report):
    section_names = {name.lower() for name in report["finalOutput"]["sectionNames"]}
    if any(name in section_names for name in {"runtime evidence", "runtime evidence or skip", "contract check", "stub status"}):
        return True
    return any(call["name"] == "requestable-execute" and call["status"] == "success" for call in report["toolCalls"])


def linear_score(value, soft_limit, hard_limit):
    if value is None:
        return 0
    if value <= soft_limit:
        return 100.0
    if value >= hard_limit:
        return 0.0
    span = hard_limit - soft_limit
    return max(0.0, 100.0 * (hard_limit - value) / span)


def critic_sections(critic_report):
    if not critic_report:
        return {}
    return critic_report.get("finalOutput", {}).get("sections", {})


def evaluate_gate(gate, scenario, run_report, critic_report, run_record):
    gate_type = gate["type"]
    if gate_type == "runStatus":
        return run_report["result"]["status"] == gate["expected"]
    if gate_type == "criticStatus":
        return critic_report is not None and critic_report["result"]["status"] == gate["expected"]
    if gate_type == "requiredSections":
        section_names = set(run_report["finalOutput"]["sectionNames"])
        return all(section in section_names for section in gate["sections"])
    if gate_type == "requiredToolCalls":
        tool_names = {call["name"] for call in run_report["toolCalls"]}
        return all(tool in tool_names for tool in gate["tools"])
    if gate_type == "requiredTerms":
        return all(normalize_text(term) in normalize_text(run_report["finalOutput"]["rawText"]) for term in gate["terms"])
    if gate_type == "saveEvidence":
        return has_save_evidence(run_report)
    if gate_type == "runtimeEvidence":
        return has_runtime_evidence(run_report)
    if gate_type == "fixtureMetadataPresent":
        path = run_record.get("fixtureMetadataPath")
        return bool(path and Path(path).is_file())
    raise ValueError(f"Unsupported gate type: {gate_type}")


def allowed_skip(scenario, run_report):
    if run_report["result"]["status"] != "SKIPPED":
        return False
    reason = normalize_text(run_report["result"]["reason"])
    return any(normalize_text(item) in reason for item in scenario["allowedSkipReasons"])


def guidance_score(critic_report):
    if not critic_report:
        return 30.0
    text = normalize_text(critic_sections(critic_report).get("Guide Compliance", ""))
    if not text:
        return 50.0
    if "non-compliant" in text or "did not" in text:
        return 20.0
    return 100.0


def contract_score(run_report, critic_report):
    run_text = normalize_text(run_report["finalOutput"]["rawText"])
    critic_findings = normalize_text(critic_sections(critic_report).get("Findings", "") if critic_report else "")
    if any(token in critic_findings for token in ["contract drift", "raw connector", "leak raw", "same top-level fields were not preserved"]):
        return 0.0
    if any(token in run_text for token in ["contract check", "stub status", "required public contract", "top-level fields"]):
        return 100.0
    return 60.0


def runtime_score(run_report):
    successful_execs = sum(1 for call in run_report["toolCalls"] if call["name"] == "requestable-execute" and call["status"] == "success")
    if successful_execs >= 2:
        return 100.0
    if successful_execs == 1:
        return 75.0
    if has_runtime_evidence(run_report):
        return 40.0
    return 0.0


def critique_score(run_report):
    critique = (run_report["finalOutput"].get("mcpCritique") or "").strip()
    if not critique:
        return 0.0
    if len(critique) >= 24 and "none" not in critique.lower():
        return 100.0
    return 50.0


def extract_finding_lines(critic_report):
    if not critic_report:
        return []
    lines = []
    findings_text = critic_sections(critic_report).get("Findings", "")
    for line in findings_text.splitlines():
        stripped = line.strip()
        if re.match(r"^(?:\d+\.|-)\s+", stripped):
            lines.append(re.sub(r"^(?:\d+\.|-)\s+", "", stripped))
    mcp_ux = critic_sections(critic_report).get("MCP UX Critique", "").strip()
    if mcp_ux:
        lines.append(mcp_ux.splitlines()[0].strip())
    return lines


def is_actionable_finding(text):
    lower = normalize_text(text)
    generic_tokens = [
        "no blocking finding",
        "one concrete mcp critique captured from the run is enough for this review",
        "accept the run for benchmark scoring",
        "no material evidence gap",
        "guide-compliant",
    ]
    return bool(lower) and all(token not in lower for token in generic_tokens)


def infer_finding_shape(text):
    lower = normalize_text(text)
    tools = [
        "palette-list",
        "databaseobject-tree-apply",
        "databaseobject-tree-get",
        "requestable-execute",
        "project-save",
        "log-view",
        "batch-call",
        "databaseobject-search",
    ]
    for tool in tools:
        if tool in lower:
            return ("tool", tool, "mcp-tooling")
    if "guide" in lower:
        return ("guide", "guide-compliance", "guides")
    if "prompt" in lower:
        return ("prompt", "prompt-behavior", "prompts")
    if "postgres" in lower or "fixture" in lower or "docker" in lower:
        return ("fixture", "postgres-v1", "fixtures")
    return ("scenario", "benchmark-flow", "benchmarks")


def infer_severity(text):
    lower = normalize_text(text)
    if any(token in lower for token in ["failed", "did not complete", "contract drift", "missing runtime evidence"]):
        return 3
    if any(token in lower for token in ["missing", "incomplete", "skipped"]):
        return 2
    return 1


def first_sentence(text):
    stripped = re.sub(r"\s+", " ", text).strip()
    if "." in stripped:
        return stripped.split(".", 1)[0].strip()
    return stripped[:180]


def build_findings(run_records, run_reports, critic_reports):
    grouped = {}
    for run_record in run_records:
        run_id = run_record["runId"]
        critic_report = critic_reports.get(run_id)
        run_report = run_reports[run_id]
        for item in extract_finding_lines(critic_report):
            if not is_actionable_finding(item):
                continue
            area, subject_id, owner = infer_finding_shape(item)
            symptom = first_sentence(item)
            key = (area, subject_id, symptom)
            if key not in grouped:
                grouped[key] = {
                    "area": area,
                    "subjectId": subject_id,
                    "symptom": symptom,
                    "count": 0,
                    "severity": infer_severity(item),
                    "scenarioIds": set(),
                    "evidenceRunIds": set(),
                    "providers": set(),
                    "models": set(),
                    "recommendedOwner": owner,
                }
            finding = grouped[key]
            finding["count"] += 1
            finding["severity"] = max(finding["severity"], infer_severity(item))
            finding["scenarioIds"].add(run_record["scenarioId"])
            finding["evidenceRunIds"].add(run_id)
            if run_report.get("provider"):
                finding["providers"].add(run_report["provider"])
            if run_report.get("model"):
                finding["models"].add(run_report["model"])
    normalized = []
    for finding in grouped.values():
        normalized.append(
            {
                "area": finding["area"],
                "subjectId": finding["subjectId"],
                "symptom": finding["symptom"],
                "count": finding["count"],
                "severity": finding["severity"],
                "scenarioIds": sorted(finding["scenarioIds"]),
                "evidenceRunIds": sorted(finding["evidenceRunIds"]),
                "providers": sorted(finding["providers"]),
                "models": sorted(finding["models"]),
                "recommendedOwner": finding["recommendedOwner"],
            }
        )
    normalized.sort(key=lambda item: (-item["count"], -item["severity"], item["area"], item["subjectId"], item["symptom"]))
    return normalized


def format_markdown(aggregate, aggregate_critic_summary):
    lines = [
        "# Campaign",
        "",
        f"- `candidateId`: `{aggregate['candidateId']}`",
        f"- `suiteId`: `{aggregate['suiteId']}`",
        f"- `overallScore`: `{aggregate['overallScore']:.2f}`",
        f"- `pass/fail/skipped`: `{aggregate['passCount']}/{aggregate['failCount']}/{aggregate['skippedCount']}`",
        "",
        "# Scenario Results",
        "",
    ]
    for item in aggregate["scenarioResults"]:
        lines.append(
            f"- `{item['scenarioId']}`: status `{item['status']}`, gates `{item['gateStatus']}`, score `{item['score']:.2f}`"
        )
    lines.extend(["", "# Top Findings", ""])
    if aggregate["topFindings"]:
        for finding in aggregate["topFindings"]:
            lines.append(
                f"- [{finding['area']}/{finding['subjectId']}] count `{finding['count']}`, severity `{finding['severity']}`: {finding['symptom']}"
            )
    else:
        lines.append("- None")
    lines.extend(["", "# Aggregate Critic", "", aggregate_critic_summary or "No aggregate critic summary available.", ""])
    return "\n".join(lines)


def main():
    args = parse_args()
    campaign_dir = Path(args.campaign_dir).resolve()
    suite = load_json(args.suite)
    manifest = load_json(campaign_dir / "manifest.json")

    run_records = manifest.get("runs", [])
    scenario_map = {scenario["scenarioId"]: scenario for scenario in suite["scenarios"]}
    run_reports = {item["runId"]: load_json(item["reportPath"]) for item in run_records}
    critic_reports = {}
    for item in run_records:
        critic_path = item.get("criticReportPath")
        if critic_path and Path(critic_path).is_file():
            critic_reports[item["runId"]] = load_json(critic_path)

    scenario_results = []
    total_weight = 0.0
    total_score = 0.0
    pass_count = 0
    fail_count = 0
    skipped_count = 0
    gate_failure_count = 0
    total_tool_calls = 0
    total_duration_ms = 0
    duration_count = 0
    rag_calls = 0

    for run_record in run_records:
        scenario = scenario_map[run_record["scenarioId"]]
        run_report = run_reports[run_record["runId"]]
        critic_report = critic_reports.get(run_record["runId"])

        if allowed_skip(scenario, run_report):
            gate_status = "SKIPPED"
            score = 0.0
            skipped_count += 1
        else:
            if run_report["result"]["status"] != scenario["requiredResultStatus"]:
                gate_failure_count += 1
                gate_status = "FAIL"
                score = 0.0
                fail_count += 1
                total_tool_calls += run_report["toolStats"]["totalToolCalls"]
                rag_calls += run_report["toolStats"]["ragCalls"]
                if run_report["durationMs"] is not None:
                    total_duration_ms += run_report["durationMs"]
                    duration_count += 1
                scenario_results.append(
                    {
                        "scenarioId": scenario["scenarioId"],
                        "runId": run_record["runId"],
                        "status": run_report["result"]["status"],
                        "gateStatus": gate_status,
                        "score": round(score, 2),
                        "weightedScore": round(score * scenario["scenarioWeight"], 2),
                        "runReportPath": run_record["reportPath"],
                        "criticReportPath": run_record.get("criticReportPath"),
                    }
                )
                continue
            failing_gates = [gate["id"] for gate in scenario["gateChecks"] if not evaluate_gate(gate, scenario, run_report, critic_report, run_record)]
            gate_failure_count += len(failing_gates)
            if failing_gates:
                gate_status = "FAIL"
                score = 0.0
                fail_count += 1
            else:
                gate_status = "PASS"
                pass_count += 1
                weights = scenario["scoreWeights"]
                efficiency = linear_score(
                    run_report["toolStats"]["totalToolCalls"], scenario["toolCallSoftLimit"], scenario["toolCallHardLimit"]
                )
                latency = linear_score(
                    run_report["durationMs"] or scenario["durationHardLimitMs"],
                    scenario["durationSoftLimitMs"],
                    scenario["durationHardLimitMs"],
                )
                dimensions = {
                    "taskSuccess": 100.0 if run_report["result"]["status"] == "PASS" else 0.0,
                    "runtimeEvidenceQuality": runtime_score(run_report),
                    "contractPreservation": contract_score(run_report, critic_report),
                    "toolEfficiency": efficiency,
                    "latency": latency,
                    "guidanceCompliance": guidance_score(critic_report),
                    "mcpCritiqueQuality": critique_score(run_report),
                }
                score = sum(dimensions[name] * weights[name] / 100.0 for name in weights)
                total_weight += scenario["scenarioWeight"]
                total_score += score * scenario["scenarioWeight"]

        total_tool_calls += run_report["toolStats"]["totalToolCalls"]
        rag_calls += run_report["toolStats"]["ragCalls"]
        if run_report["durationMs"] is not None:
            total_duration_ms += run_report["durationMs"]
            duration_count += 1

        scenario_results.append(
            {
                "scenarioId": scenario["scenarioId"],
                "runId": run_record["runId"],
                "status": run_report["result"]["status"],
                "gateStatus": gate_status,
                "score": round(score, 2),
                "weightedScore": round(score * scenario["scenarioWeight"], 2),
                "runReportPath": run_record["reportPath"],
                "criticReportPath": run_record.get("criticReportPath"),
            }
        )

    aggregate_findings = build_findings(run_records, run_reports, critic_reports)
    aggregate_critic = manifest.get("aggregateCritic") or {"runId": None, "status": None, "reportPath": None, "summaryPath": None}
    aggregate_critic_summary = ""
    if aggregate_critic.get("summaryPath") and Path(aggregate_critic["summaryPath"]).is_file():
        aggregate_critic_summary = Path(aggregate_critic["summaryPath"]).read_text(encoding="utf-8").strip()

    aggregate = {
        "schemaVersion": SCHEMA_VERSION,
        "candidateId": manifest["candidateId"],
        "suiteId": manifest["suiteId"],
        "startedAt": manifest.get("startedAt"),
        "finishedAt": manifest.get("finishedAt"),
        "overallScore": round(total_score / total_weight, 2) if total_weight else 0.0,
        "passCount": pass_count,
        "failCount": fail_count,
        "skippedCount": skipped_count,
        "gateFailureCount": gate_failure_count,
        "averageToolCalls": round(total_tool_calls / len(run_records), 2) if run_records else 0.0,
        "averageDurationMs": round(total_duration_ms / duration_count, 2) if duration_count else 0.0,
        "ragCallRate": round(rag_calls / len(run_records), 2) if run_records else 0.0,
        "scenarioResults": scenario_results,
        "topFindings": aggregate_findings[:10],
        "aggregateCritic": aggregate_critic,
    }

    aggregate_dir = campaign_dir / "aggregate"
    write_json(aggregate_dir / "findings.json", aggregate)
    (aggregate_dir / "findings.md").write_text(format_markdown(aggregate, aggregate_critic_summary), encoding="utf-8")

    print(f"Findings JSON: {aggregate_dir / 'findings.json'}")
    print(f"Findings MD: {aggregate_dir / 'findings.md'}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
