#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path


SCHEMA_VERSION = "1.1.0"
PORT_COERCION_PATTERNS = [
    r"materializ(?:ed|ing) runtime port `0`",
    r"silently materializing `0`",
    r"numeric connector ports",
    r"resent as string",
    r"HttpConnector\.port=443.*port `0`",
]


def parse_args():
    parser = argparse.ArgumentParser(description="Compare two scored benchmark campaigns.")
    parser.add_argument("--baseline-campaign-dir", required=True, help="Path to the baseline campaign directory.")
    parser.add_argument("--candidate-campaign-dir", required=True, help="Path to the candidate campaign directory.")
    parser.add_argument("--out-dir", required=True, help="Directory that will receive comparison.json and comparison.md.")
    parser.add_argument("--maintainer-packet", default="", help="Optional maintainer packet JSON path.")
    parser.add_argument(
        "--targeted-replay-campaign-dir",
        default="",
        help="Optional targeted replay campaign directory used to verify the selected finding before full replay verdict.",
    )
    return parser.parse_args()


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, payload):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def finding_key(item):
    return (item["area"], item["subjectId"], item["symptom"])


def repeated_finding_count(findings):
    return sum(1 for item in findings if item["count"] > 1)


def scenario_map(aggregate):
    return {item["scenarioId"]: item for item in aggregate.get("scenarioResults", [])}


def load_campaign(campaign_dir):
    campaign_path = Path(campaign_dir).resolve()
    manifest_path = campaign_path / "manifest.json"
    aggregate_path = campaign_path / "aggregate" / "findings.json"
    manifest = load_json(manifest_path)
    aggregate = load_json(aggregate_path) if aggregate_path.is_file() else None
    return campaign_path, manifest_path, manifest, aggregate_path, aggregate


def build_scenario_deltas(baseline_aggregate, candidate_aggregate):
    baseline_map = scenario_map(baseline_aggregate)
    candidate_map = scenario_map(candidate_aggregate)
    deltas = []
    for scenario_id in sorted(set(baseline_map) | set(candidate_map)):
        baseline = baseline_map.get(scenario_id)
        candidate = candidate_map.get(scenario_id)
        notes = []
        if baseline is None:
            notes.append("Scenario was not present in the baseline aggregate.")
        if candidate is None:
            notes.append("Scenario is missing from the candidate aggregate.")
        if baseline and candidate and baseline["status"] == "PASS" and candidate["status"] == "FAIL":
            notes.append("Previously passing scenario regressed to FAIL.")
        if baseline and candidate and baseline["gateStatus"] == "PASS" and candidate["gateStatus"] == "FAIL":
            notes.append("Scenario introduced a new gate failure.")
        deltas.append(
            {
                "scenarioId": scenario_id,
                "baselineStatus": None if baseline is None else baseline["status"],
                "candidateStatus": None if candidate is None else candidate["status"],
                "baselineGateStatus": None if baseline is None else baseline["gateStatus"],
                "candidateGateStatus": None if candidate is None else candidate["gateStatus"],
                "scoreDelta": 0.0 if baseline is None or candidate is None else round(candidate["score"] - baseline["score"], 2),
                "weightedScoreDelta": 0.0
                if baseline is None or candidate is None
                else round(candidate["weightedScore"] - baseline["weightedScore"], 2),
                "notes": notes,
            }
        )
    return deltas


def selected_finding_ids(packet):
    if not packet:
        return []
    return packet.get("selectedFindingIds", [])


def coercion_issue_present(text):
    lowered = text or ""
    return any(re.search(pattern, lowered, flags=re.IGNORECASE) for pattern in PORT_COERCION_PATTERNS)


def verify_targeted_replay(targeted_dir, packet):
    if not targeted_dir:
        return False, ["No targeted replay campaign path was provided."]
    campaign_dir, manifest_path, manifest, aggregate_path, aggregate = load_campaign(targeted_dir)
    reasons = []
    if not manifest_path.is_file():
        reasons.append("Targeted replay manifest is missing.")
    if manifest.get("finishedAt") is None:
        reasons.append("Targeted replay manifest is incomplete.")
    if aggregate is None:
        reasons.append("Targeted replay aggregate is missing.")
        return False, reasons

    scenario_results = aggregate.get("scenarioResults", [])
    if len(scenario_results) != 1:
        reasons.append("Targeted replay must contain exactly one scenario.")
    else:
        result = scenario_results[0]
        if result["status"] != "PASS":
            reasons.append(f"Targeted replay scenario returned {result['status']}.")
        if result["gateStatus"] != "PASS":
            reasons.append(f"Targeted replay gate status is {result['gateStatus']}.")

    selected_ids = selected_finding_ids(packet)
    if "finding-httpconnector-port-coercion" in selected_ids:
        report_paths = []
        for run in manifest.get("runs", []):
            for key in ("reportPath", "criticReportPath", "summaryPath"):
                if run.get(key):
                    report_paths.append(Path(run[key]))
        for path in report_paths:
            if not path.is_file():
                continue
            text = path.read_text(encoding="utf-8")
            if coercion_issue_present(text):
                reasons.append(f"Targeted replay still contains HTTP port coercion evidence in {path}.")
                break

    return len(reasons) == 0, reasons


def format_markdown(comparison):
    lines = [
        "# Campaign Comparison",
        "",
        f"- `baselineCandidateId`: `{comparison['baselineCandidateId']}`",
        f"- `candidateId`: `{comparison['candidateId']}`",
        f"- `suiteId`: `{comparison['suiteId']}`",
        f"- `provider/model`: `{comparison['provider']}` / `{comparison['model']}`",
        f"- `overallScoreDelta`: `{comparison['overallScoreDelta']:.2f}`",
        f"- `targetedReplayVerified`: `{comparison['targetedReplayVerified']}`",
        f"- `verdict`: `{comparison['verdict']}`",
        "",
        "# Verdict Reasons",
        "",
    ]
    if comparison["verdictReasons"]:
        for reason in comparison["verdictReasons"]:
            lines.append(f"- {reason}")
    else:
        lines.append("- none")
    lines.extend(
        [
            "",
            "# Scenario Deltas",
            "",
        ]
    )
    for item in comparison["scenarioDeltas"]:
        note_text = "; ".join(item["notes"]) if item["notes"] else "no notable delta"
        lines.append(
            f"- `{item['scenarioId']}`: `{item['baselineStatus']}` -> `{item['candidateStatus']}`, gates `{item['baselineGateStatus']}` -> `{item['candidateGateStatus']}`, score delta `{item['scoreDelta']:.2f}` ({note_text})"
        )
    lines.extend(
        [
            "",
            "# Finding Delta",
            "",
            f"- baseline findings: `{comparison['findingDelta']['baselineCount']}`",
            f"- candidate findings: `{comparison['findingDelta']['candidateCount']}`",
            f"- resolved findings: `{comparison['findingDelta']['resolvedCount']}`",
            f"- introduced findings: `{comparison['findingDelta']['introducedCount']}`",
            f"- repeated findings delta: `{comparison['findingDelta']['repeatedCountDelta']}`",
            f"- targeted resolved findings: `{comparison['findingDelta']['targetedResolvedCount']}`",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def main():
    args = parse_args()
    baseline_dir, baseline_manifest_path, baseline_manifest, baseline_aggregate_path, baseline_aggregate = load_campaign(
        args.baseline_campaign_dir
    )
    candidate_dir, candidate_manifest_path, candidate_manifest, candidate_aggregate_path, candidate_aggregate = load_campaign(
        args.candidate_campaign_dir
    )
    packet = load_json(args.maintainer_packet) if args.maintainer_packet else None

    reasons = []
    comparison = {
        "schemaVersion": SCHEMA_VERSION,
        "baselineCandidateId": baseline_manifest["candidateId"],
        "candidateId": candidate_manifest["candidateId"],
        "baselineCampaignPath": str(baseline_dir),
        "candidateCampaignPath": str(candidate_dir),
        "targetedReplayCampaignPath": str(Path(args.targeted_replay_campaign_dir).resolve())
        if args.targeted_replay_campaign_dir
        else None,
        "suiteId": baseline_manifest["suiteId"],
        "provider": candidate_manifest.get("provider"),
        "model": candidate_manifest.get("model"),
        "overallScoreDelta": 0.0,
        "passFailSkippedDelta": {
            "passCount": 0,
            "failCount": 0,
            "skippedCount": 0,
        },
        "gateFailureDelta": 0,
        "averageToolCallsDelta": 0.0,
        "averageDurationMsDelta": 0.0,
        "ragCallRateDelta": 0.0,
        "findingDelta": {
            "baselineCount": 0,
            "candidateCount": 0,
            "resolvedCount": 0,
            "introducedCount": 0,
            "repeatedCountDelta": 0,
            "targetedResolvedCount": 0,
        },
        "selectedFindingIds": selected_finding_ids(packet),
        "targetedReplayVerified": False,
        "verdict": "BLOCKED",
        "verdictReasons": [],
        "scenarioDeltas": [],
    }

    if baseline_aggregate is None:
        reasons.append(f"Baseline aggregate is missing: {baseline_aggregate_path}")
    if candidate_aggregate is None:
        reasons.append(f"Candidate aggregate is missing: {candidate_aggregate_path}")

    if baseline_manifest.get("finishedAt") is None:
        reasons.append("Baseline campaign manifest is incomplete.")
    if candidate_manifest.get("finishedAt") is None:
        reasons.append("Candidate campaign manifest is incomplete.")

    tuple_matches = (
        baseline_manifest.get("provider") == candidate_manifest.get("provider")
        and baseline_manifest.get("model") == candidate_manifest.get("model")
        and baseline_manifest.get("codexVersion") == candidate_manifest.get("codexVersion")
    )
    if not tuple_matches:
        reasons.append("Replay provider/model/codexVersion tuple does not match the baseline campaign.")

    targeted_replay_reasons = []
    if args.targeted_replay_campaign_dir:
        comparison["targetedReplayVerified"], targeted_replay_reasons = verify_targeted_replay(
            args.targeted_replay_campaign_dir,
            packet,
        )
        reasons.extend(targeted_replay_reasons)

    if reasons and (baseline_aggregate is None or candidate_aggregate is None):
        comparison["verdict"] = "BLOCKED"
        comparison["verdictReasons"] = reasons
        out_dir = Path(args.out_dir).resolve()
        write_json(out_dir / "comparison.json", comparison)
        (out_dir / "comparison.md").write_text(format_markdown(comparison), encoding="utf-8")
        print(f"Comparison JSON: {out_dir / 'comparison.json'}")
        print(f"Comparison MD: {out_dir / 'comparison.md'}")
        return

    comparison["overallScoreDelta"] = round(candidate_aggregate["overallScore"] - baseline_aggregate["overallScore"], 2)
    comparison["passFailSkippedDelta"] = {
        "passCount": candidate_aggregate["passCount"] - baseline_aggregate["passCount"],
        "failCount": candidate_aggregate["failCount"] - baseline_aggregate["failCount"],
        "skippedCount": candidate_aggregate["skippedCount"] - baseline_aggregate["skippedCount"],
    }
    comparison["gateFailureDelta"] = candidate_aggregate["gateFailureCount"] - baseline_aggregate["gateFailureCount"]
    comparison["averageToolCallsDelta"] = round(
        candidate_aggregate["averageToolCalls"] - baseline_aggregate["averageToolCalls"], 2
    )
    comparison["averageDurationMsDelta"] = round(
        candidate_aggregate["averageDurationMs"] - baseline_aggregate["averageDurationMs"], 2
    )
    comparison["ragCallRateDelta"] = round(candidate_aggregate["ragCallRate"] - baseline_aggregate["ragCallRate"], 2)

    baseline_findings = {finding_key(item): item for item in baseline_aggregate["topFindings"]}
    candidate_findings = {finding_key(item): item for item in candidate_aggregate["topFindings"]}
    resolved = sorted(set(baseline_findings) - set(candidate_findings))
    introduced = sorted(set(candidate_findings) - set(baseline_findings))
    targeted_keys = set()
    if packet:
        targeted_keys = {
            f"{item['area']}|{item['subjectId']}|{item['symptom']}"
            for item in packet.get("selectedFindings", [])
        }
    targeted_resolved = 0
    if targeted_keys:
        candidate_string_keys = {f"{key[0]}|{key[1]}|{key[2]}" for key in candidate_findings}
        targeted_resolved = sum(1 for key in targeted_keys if key not in candidate_string_keys)

    comparison["findingDelta"] = {
        "baselineCount": len(baseline_findings),
        "candidateCount": len(candidate_findings),
        "resolvedCount": len(resolved),
        "introducedCount": len(introduced),
        "repeatedCountDelta": repeated_finding_count(candidate_aggregate["topFindings"])
        - repeated_finding_count(baseline_aggregate["topFindings"]),
        "targetedResolvedCount": targeted_resolved,
    }
    comparison["scenarioDeltas"] = build_scenario_deltas(baseline_aggregate, candidate_aggregate)

    verdict = "REJECTED"
    verdict_reasons = []
    if any(item["baselineStatus"] == "PASS" and item["candidateStatus"] == "FAIL" for item in comparison["scenarioDeltas"]):
        verdict_reasons.append("At least one previously passing scenario regressed to FAIL.")
    elif comparison["gateFailureDelta"] > 0:
        verdict_reasons.append("Gate failure count increased.")
    elif comparison["passFailSkippedDelta"]["failCount"] > 0:
        verdict_reasons.append("Fail count increased.")
    elif args.targeted_replay_campaign_dir and not comparison["targetedReplayVerified"]:
        verdict_reasons.extend(targeted_replay_reasons or ["Targeted replay verification failed."])
    elif comparison["overallScoreDelta"] >= 1.0:
        verdict = "ACCEPTED"
        verdict_reasons.append("Overall score improved by at least 1.0.")
    else:
        repeated_decreased = comparison["findingDelta"]["repeatedCountDelta"] < 0
        targeted_improved = comparison["findingDelta"]["targetedResolvedCount"] > 0 and comparison["gateFailureDelta"] <= 0
        targeted_verified = args.targeted_replay_campaign_dir and comparison["targetedReplayVerified"]
        if comparison["overallScoreDelta"] >= -0.1 and targeted_verified:
            verdict = "ACCEPTED"
            verdict_reasons.append("Selected finding was verified in targeted replay without introducing a global regression.")
        elif comparison["overallScoreDelta"] >= -0.1 and (repeated_decreased or targeted_improved):
            verdict = "ACCEPTED"
            if repeated_decreased:
                verdict_reasons.append("Repeated actionable findings decreased without score regression beyond the tolerance.")
            if targeted_improved:
                verdict_reasons.append("A targeted finding disappeared from the aggregate without introducing a new gate failure.")
        else:
            verdict_reasons.append("Candidate did not clear the acceptance policy.")

    if verdict != "ACCEPTED":
        verdict = "REJECTED"
    comparison["verdict"] = verdict
    comparison["verdictReasons"] = verdict_reasons

    out_dir = Path(args.out_dir).resolve()
    write_json(out_dir / "comparison.json", comparison)
    (out_dir / "comparison.md").write_text(format_markdown(comparison), encoding="utf-8")

    print(f"Comparison JSON: {out_dir / 'comparison.json'}")
    print(f"Comparison MD: {out_dir / 'comparison.md'}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
