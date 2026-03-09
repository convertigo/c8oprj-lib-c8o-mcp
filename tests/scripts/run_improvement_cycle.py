#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


SCHEMA_VERSION = "1.0.0"
DEFAULT_MCP_URL = "http://localhost:18080/convertigo/api/mcp"
MAINTAINER_PROMPT_NAME = "convertigo-maintainer"


def repo_root():
    return Path(__file__).resolve().parents[2]


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def parse_args():
    root = repo_root()
    parser = argparse.ArgumentParser(description="Run one Phase 5 improvement cycle.")
    parser.add_argument("--baseline-campaign-dir", required=True, help="Path to the baseline Phase 4 campaign directory.")
    parser.add_argument("--improvement-root", default=str(root / "tests" / "improvement"), help="Improvement output root.")
    parser.add_argument("--cycle-id", default="cycle-001", help="Cycle identifier, for example cycle-001.")
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL, help="Convertigo MCP endpoint for the candidate runtime.")
    parser.add_argument("--maintainer-timeout", type=int, default=1800, help="Wall-clock timeout in seconds for the maintainer run.")
    parser.add_argument("--scenario-timeout", type=int, default=1800, help="Wall-clock timeout in seconds for one replay scenario.")
    parser.add_argument("--critic-timeout", type=int, default=300, help="Wall-clock timeout in seconds for one replay run critic.")
    parser.add_argument("--aggregate-timeout", type=int, default=600, help="Wall-clock timeout in seconds for the replay aggregate critic.")
    parser.add_argument("--request-timeout", type=int, default=900, help="Codex request timeout in seconds.")
    parser.add_argument("--reasoning-effort", default="", help="Optional reasoning effort override. Defaults to the baseline campaign value.")
    parser.add_argument("--model", default="", help="Optional model override. Defaults to the baseline campaign value.")
    parser.add_argument("--codex-bin", default=os.environ.get("CODEX_BIN", ""), help="Optional Codex binary override.")
    return parser.parse_args()


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, payload):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def run_command(args, cwd=None, env=None, timeout=None):
    return subprocess.run(args, cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout)


def git_output(root, *args):
    result = run_command(["git", *args], cwd=root)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


def ensure_clean_repo(root):
    status = git_output(root, "status", "--porcelain")
    if status.strip():
        raise RuntimeError("Improvement cycles require a clean baseline repository.")


def parse_project_version(root):
    text = (root / "c8oProject.yaml").read_text(encoding="utf-8")
    match = re.search(r"^\s{2}version:\s*(\S+)\s*$", text, re.MULTILINE)
    if not match:
        raise RuntimeError("Could not find project version in c8oProject.yaml")
    return match.group(1)


def bump_patch(version):
    match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", version)
    if not match:
        raise RuntimeError(f"Unsupported project version format: {version}")
    return f"{match.group(1)}.{match.group(2)}.{int(match.group(3)) + 1}"


def parse_codex_npm_version(codex_version):
    match = re.search(r"(\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?)", codex_version or "")
    if not match:
        return ""
    return match.group(1)


def prompt_catalog(root):
    return {item["name"]: item for item in load_json(root / "prompts" / "prompts_index.json")}


def finding_string(item):
    return f"{item['area']}|{item['subjectId']}|{item['symptom']}"


def canonical_owner(value):
    mapping = {
        "mcp-tooling": "tool",
        "guides": "guide",
        "prompts": "prompt",
        "benchmarks": "scenario",
        "fixtures": "fixture",
        "tool": "tool",
        "guide": "guide",
        "prompt": "prompt",
        "scenario": "scenario",
        "fixture": "fixture",
    }
    return mapping.get(value, value)


def normalize_finding(item):
    normalized = dict(item)
    normalized["recommendedOwner"] = canonical_owner(item.get("recommendedOwner"))
    return normalized


def select_findings(top_findings):
    allowed = {"tool", "guide", "prompt", "scenario", "fixture"}
    normalized = [normalize_finding(item) for item in top_findings]
    selected = [item for item in normalized if item.get("recommendedOwner") in allowed]
    selected.sort(key=lambda item: (-item["severity"], -item["count"], item["area"], item["subjectId"], item["symptom"]))
    return normalized, selected[:5]


def build_evidence_paths(manifest, selected_findings):
    runs_by_id = {item["runId"]: item for item in manifest.get("runs", [])}
    run_ids = []
    for finding in selected_findings:
        for run_id in finding.get("evidenceRunIds", []):
            if run_id not in run_ids and run_id in runs_by_id:
                run_ids.append(run_id)
    return {
        "campaignManifest": str(Path(manifest["__manifest_path__"]).resolve()),
        "aggregateFindings": str(Path(manifest["__aggregate_path__"]).resolve()),
        "runReports": [runs_by_id[run_id]["reportPath"] for run_id in run_ids],
        "runSummaries": [runs_by_id[run_id]["summaryPath"] for run_id in run_ids],
        "criticReports": [runs_by_id[run_id].get("criticReportPath") for run_id in run_ids if runs_by_id[run_id].get("criticReportPath")],
        "rawLogs": [runs_by_id[run_id]["logPath"] for run_id in run_ids],
    }


def build_relevant_context(root, manifest, selected_findings):
    prompts = prompt_catalog(root)
    runs_by_id = {item["runId"]: item for item in manifest.get("runs", [])}
    relevant_guides = []
    relevant_prompts = []
    for finding in selected_findings:
        for run_id in finding.get("evidenceRunIds", []):
            run_record = runs_by_id.get(run_id)
            if not run_record:
                continue
            if run_record["rolePromptName"] not in relevant_prompts:
                relevant_prompts.append(run_record["rolePromptName"])
            role = prompts.get(run_record["rolePromptName"])
            if role:
                for guide_id in role.get("guideIds", []):
                    if guide_id not in relevant_guides:
                        relevant_guides.append(guide_id)
    base_guides = [
        "convertigo/start@1",
        "convertigo/engineering-workflow@1",
        "convertigo/validation-and-evidence@1",
    ]
    for guide_id in reversed(base_guides):
        if guide_id not in relevant_guides:
            relevant_guides.insert(0, guide_id)
    return relevant_guides, relevant_prompts


def build_packet(root, baseline_campaign_dir, manifest, aggregate):
    top_findings, selected_findings = select_findings(aggregate.get("topFindings", []))
    relevant_guides, relevant_prompts = build_relevant_context(root, manifest, selected_findings)
    packet = {
        "schemaVersion": SCHEMA_VERSION,
        "baselineCandidateId": manifest["candidateId"],
        "baselineGitSha": manifest["gitSha"],
        "suiteId": manifest["suiteId"],
        "provider": manifest.get("provider"),
        "model": manifest.get("model"),
        "codexVersion": manifest["codexVersion"],
        "projectVersion": manifest["projectVersion"],
        "topFindings": top_findings,
        "selectedFindings": selected_findings,
        "scenarioSummary": aggregate.get("scenarioResults", []),
        "relevantGuides": relevant_guides,
        "relevantPrompts": relevant_prompts,
        "allowedMutationAreas": [
            "tool",
            "auto-documentation",
            "guide",
            "prompt",
            "scenario",
            "fixture",
            "review-doc"
        ],
        "forbiddenMutationAreas": [
            "external-infrastructure",
            "global-provider-config",
            "unrelated-product-work"
        ],
        "evidencePaths": build_evidence_paths(manifest, selected_findings),
        "acceptanceTargets": {
            "overallScoreMinDelta": 1.0,
            "maxOverallScoreRegression": 0.1,
            "forbidPassToFail": True,
            "forbidGateFailureIncrease": True,
            "forbidFailCountIncrease": True,
            "requiredRunnerTuple": {
                "provider": manifest.get("provider"),
                "model": manifest.get("model"),
                "codexVersion": manifest["codexVersion"],
            },
            "targetedFindingKeys": [finding_string(item) for item in selected_findings if item.get("severity", 0) >= 3],
        },
    }
    return packet


def render_packet_markdown(packet):
    lines = [
        "# Maintainer Packet",
        "",
        f"- Baseline candidate: `{packet['baselineCandidateId']}`",
        f"- Suite: `{packet['suiteId']}`",
        f"- Provider/model: `{packet['provider']}` / `{packet['model']}`",
        f"- Codex version: `{packet['codexVersion']}`",
        f"- Project version: `{packet['projectVersion']}`",
        "",
        "## Selected Findings",
        "",
    ]
    if packet["selectedFindings"]:
        for item in packet["selectedFindings"]:
            lines.append(
                f"- [{item['area']}/{item['subjectId']}] severity `{item['severity']}`, count `{item['count']}`: {item['symptom']}"
            )
    else:
        lines.append("- none")

    lines.extend(
        [
            "",
            "## Relevant Guides",
            "",
        ]
    )
    for item in packet["relevantGuides"]:
        lines.append(f"- `{item}`")

    lines.extend(
        [
            "",
            "## Relevant Prompts",
            "",
        ]
    )
    for item in packet["relevantPrompts"]:
        lines.append(f"- `{item}`")

    lines.extend(
        [
            "",
            "## Acceptance Targets",
            "",
            f"- overall score delta >= `{packet['acceptanceTargets']['overallScoreMinDelta']}` is an automatic accept",
            f"- overall score regression tolerance: `{packet['acceptanceTargets']['maxOverallScoreRegression']}`",
            f"- forbid pass-to-fail: `{packet['acceptanceTargets']['forbidPassToFail']}`",
            f"- forbid gate failure increase: `{packet['acceptanceTargets']['forbidGateFailureIncrease']}`",
            f"- forbid fail count increase: `{packet['acceptanceTargets']['forbidFailCountIncrease']}`",
            "",
            "## Evidence Paths",
            "",
            f"- Campaign manifest: `{packet['evidencePaths']['campaignManifest']}`",
            f"- Aggregate findings: `{packet['evidencePaths']['aggregateFindings']}`",
        ]
    )
    for field in ("runReports", "runSummaries", "criticReports", "rawLogs"):
        if packet["evidencePaths"][field]:
            lines.append(f"- {field}:")
            for item in packet["evidencePaths"][field]:
                lines.append(f"  - `{item}`")
    return "\n".join(lines) + "\n"


def render_template(template_path, output_path, replacements):
    text = Path(template_path).read_text(encoding="utf-8")
    for key, value in replacements.items():
        text = text.replace(key, value)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text, encoding="utf-8")


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


def run_prompt(repo_dir, prompt_path, run_label, role_prompt_name, workspace_dir, artifact_dir, env_overrides, timeout_sec):
    env = os.environ.copy()
    env.update(env_overrides)
    env["WORKSPACE_DIR"] = str(workspace_dir)
    env["ARTIFACT_DIR_ROOT"] = str(artifact_dir)
    command = ["bash", "tests/run_prompt.sh", str(prompt_path), run_label]
    if role_prompt_name:
        command.append(role_prompt_name)
    result = run_command(command, cwd=repo_dir, env=env, timeout=timeout_sec)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    parsed = parse_run_prompt_output(result.stdout)
    if not parsed.get("reportPath"):
        raise RuntimeError(f"run_prompt.sh did not print report path for {run_label}")
    parsed["report"] = load_json(parsed["reportPath"])
    return parsed


def create_worktree(root, branch_name, worktree_path):
    if worktree_path.exists():
        raise RuntimeError(f"Worktree path already exists: {worktree_path}")
    existing = run_command(["git", "show-ref", "--verify", f"refs/heads/{branch_name}"], cwd=root)
    if existing.returncode == 0:
        raise RuntimeError(f"Branch already exists: {branch_name}")
    result = run_command(["git", "worktree", "add", "-b", branch_name, str(worktree_path), "HEAD"], cwd=root)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())


def commit_candidate(worktree_path, message):
    add = run_command(["git", "add", "-A"], cwd=worktree_path)
    if add.returncode != 0:
        raise RuntimeError(add.stderr.strip() or add.stdout.strip())
    commit = run_command(["git", "commit", "-m", message], cwd=worktree_path)
    if commit.returncode != 0:
        raise RuntimeError(commit.stderr.strip() or commit.stdout.strip())
    return run_command(["git", "rev-parse", "HEAD"], cwd=worktree_path).stdout.strip()


def update_cycle_manifest(path, payload, state=None, blocking_reason=None):
    if state is not None:
        payload["state"] = state
    if blocking_reason is not None:
        payload["blockingReason"] = blocking_reason
    write_json(path, payload)


def main():
    args = parse_args()
    root = repo_root()
    ensure_clean_repo(root)

    baseline_campaign_dir = Path(args.baseline_campaign_dir).resolve()
    baseline_manifest_path = baseline_campaign_dir / "manifest.json"
    baseline_aggregate_path = baseline_campaign_dir / "aggregate" / "findings.json"
    baseline_manifest = load_json(baseline_manifest_path)
    baseline_manifest["__manifest_path__"] = str(baseline_manifest_path)
    baseline_manifest["__aggregate_path__"] = str(baseline_aggregate_path)
    baseline_aggregate = load_json(baseline_aggregate_path)

    cycle_dir = Path(args.improvement_root).resolve() / baseline_manifest["candidateId"] / args.cycle_id
    if cycle_dir.exists():
        raise RuntimeError(f"Improvement cycle directory already exists: {cycle_dir}")
    cycle_dir.mkdir(parents=True, exist_ok=True)

    branch_name = f"codex/candidate-{baseline_manifest['candidateId']}-{args.cycle_id}"
    worktree_path = cycle_dir / "candidate" / "worktree"
    packet_path = cycle_dir / "maintainer" / "packet.json"
    packet_md_path = cycle_dir / "maintainer" / "packet.md"
    prompt_path = cycle_dir / "maintainer" / "prompt.txt"
    comparison_dir = cycle_dir / "compare"
    replay_root = cycle_dir / "replay"

    cycle_manifest_path = cycle_dir / "manifest.json"
    cycle_manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "cycleId": args.cycle_id,
        "state": "PREPARED",
        "baselineCandidateId": baseline_manifest["candidateId"],
        "baselineCampaignPath": str(baseline_campaign_dir),
        "baselineGitSha": baseline_manifest["gitSha"],
        "suiteId": baseline_manifest["suiteId"],
        "provider": baseline_manifest.get("provider"),
        "model": baseline_manifest.get("model"),
        "codexVersion": baseline_manifest["codexVersion"],
        "startedAt": utc_now(),
        "finishedAt": None,
        "worktreePath": str(worktree_path),
        "branchName": branch_name,
        "maintainerPromptName": MAINTAINER_PROMPT_NAME,
        "packetPath": str(packet_path),
        "promptPath": str(prompt_path),
        "maintainerRun": None,
        "candidate": None,
        "replayCampaignPath": None,
        "comparisonPath": None,
        "blockingReason": None,
    }
    update_cycle_manifest(cycle_manifest_path, cycle_manifest)

    packet = build_packet(root, baseline_campaign_dir, baseline_manifest, baseline_aggregate)
    write_json(packet_path, packet)
    packet_md_path.write_text(render_packet_markdown(packet), encoding="utf-8")

    create_worktree(root, branch_name, worktree_path)

    baseline_version = parse_project_version(worktree_path)
    target_version = bump_patch(baseline_version)
    commit_message = f"chore: phase5 candidate from {baseline_manifest['candidateId']} {args.cycle_id}"

    render_template(
        root / "tests" / "prompt_maintainer_cycle.txt",
        prompt_path,
        {
            "__WORKTREE_PATH__": str(worktree_path),
            "__MAINTAINER_PACKET_PATH__": str(packet_path),
            "__MAINTAINER_PACKET_CONTENT__": packet_md_path.read_text(encoding="utf-8").rstrip(),
            "__BASELINE_PROJECT_VERSION__": baseline_version,
            "__TARGET_PROJECT_VERSION__": target_version,
            "__COMMIT_MESSAGE__": commit_message,
        },
    )

    codex_npm_version = parse_codex_npm_version(baseline_manifest["codexVersion"])
    maintainer_env = {
        "MCP_URL": args.mcp_url,
        "CODEX_REASONING_EFFORT": args.reasoning_effort or baseline_manifest.get("reasoningEffort") or "medium",
        "CODEX_REQUEST_TIMEOUT": str(args.request_timeout),
    }
    if args.model or baseline_manifest.get("model"):
        maintainer_env["CODEX_MODEL"] = args.model or baseline_manifest.get("model")
    if args.codex_bin:
        maintainer_env["CODEX_BIN"] = args.codex_bin
    if codex_npm_version:
        maintainer_env["CODEX_NPM_VERSION"] = codex_npm_version

    try:
        update_cycle_manifest(cycle_manifest_path, cycle_manifest, state="MAINTAINER_RUNNING")
        maintainer_data = run_prompt(
            worktree_path,
            prompt_path,
            "maintainer_cycle",
            MAINTAINER_PROMPT_NAME,
            worktree_path,
            cycle_dir / "maintainer" / "run",
            maintainer_env,
            timeout_sec=args.maintainer_timeout,
        )
        cycle_manifest["maintainerRun"] = {
            "runId": maintainer_data["runId"],
            "status": maintainer_data["report"]["result"]["status"],
            "reportPath": maintainer_data["reportPath"],
            "summaryPath": maintainer_data["summaryPath"],
        }
        update_cycle_manifest(cycle_manifest_path, cycle_manifest)

        diff_status = git_output(worktree_path, "status", "--porcelain")
        if not diff_status.strip():
            raise RuntimeError("Maintainer run finished without producing any repository diff.")

        candidate_version = parse_project_version(worktree_path)
        if candidate_version == baseline_version:
            raise RuntimeError("Maintainer run did not bump the project version.")

        candidate_sha = commit_candidate(worktree_path, commit_message)
        candidate_short_sha = git_output(worktree_path, "rev-parse", "--short", "HEAD")
        candidate_id = f"{candidate_version}+{candidate_short_sha}"
        candidate_metadata = {
            "baselineCandidateId": baseline_manifest["candidateId"],
            "candidateId": candidate_id,
            "branchName": branch_name,
            "gitSha": candidate_sha,
            "projectVersion": candidate_version,
            "commitMessage": commit_message,
            "worktreePath": str(worktree_path),
        }
        candidate_metadata_path = cycle_dir / "candidate" / "metadata.json"
        write_json(candidate_metadata_path, candidate_metadata)
        cycle_manifest["candidate"] = {
            "candidateId": candidate_id,
            "gitSha": candidate_sha,
            "projectVersion": candidate_version,
            "commitMessage": commit_message,
            "metadataPath": str(candidate_metadata_path),
        }
        update_cycle_manifest(cycle_manifest_path, cycle_manifest, state="CANDIDATE_COMMITTED")

        scenario_ids = ",".join(item["scenarioId"] for item in baseline_manifest.get("runs", []))
        replay_command = [
            "python3",
            "tests/scripts/run_campaign.py",
            "--suite",
            str(worktree_path / Path(baseline_manifest["suitePath"]).relative_to(root)),
            "--campaign-root",
            str(replay_root),
            "--mcp-url",
            args.mcp_url,
            "--request-timeout",
            str(args.request_timeout),
            "--scenario-timeout",
            str(args.scenario_timeout),
            "--critic-timeout",
            str(args.critic_timeout),
            "--aggregate-timeout",
            str(args.aggregate_timeout),
        ]
        if scenario_ids:
            replay_command.extend(["--only-scenarios", scenario_ids])
        if args.model or baseline_manifest.get("model"):
            replay_command.extend(["--model", args.model or baseline_manifest.get("model")])
        replay_command.extend(["--reasoning-effort", args.reasoning_effort or baseline_manifest.get("reasoningEffort") or "medium"])
        if args.codex_bin:
            replay_command.extend(["--codex-bin", args.codex_bin])

        replay_env = os.environ.copy()
        if codex_npm_version:
            replay_env["CODEX_NPM_VERSION"] = codex_npm_version
        update_cycle_manifest(cycle_manifest_path, cycle_manifest, state="REPLAY_RUNNING")
        replay_result = run_command(replay_command, cwd=worktree_path, env=replay_env)
        if replay_result.returncode != 0:
            raise RuntimeError(replay_result.stderr.strip() or replay_result.stdout.strip())

        replay_candidate_dir = replay_root / candidate_id
        cycle_manifest["replayCampaignPath"] = str(replay_candidate_dir)

        compare_command = [
            "python3",
            str(root / "tests" / "scripts" / "compare_campaigns.py"),
            "--baseline-campaign-dir",
            str(baseline_campaign_dir),
            "--candidate-campaign-dir",
            str(replay_candidate_dir),
            "--out-dir",
            str(comparison_dir),
            "--maintainer-packet",
            str(packet_path),
        ]
        compare_result = run_command(compare_command, cwd=root)
        if compare_result.returncode != 0:
            raise RuntimeError(compare_result.stderr.strip() or compare_result.stdout.strip())
        comparison_path = comparison_dir / "comparison.json"
        comparison = load_json(comparison_path)
        cycle_manifest["comparisonPath"] = str(comparison_path)
        cycle_manifest["finishedAt"] = utc_now()
        state = comparison["verdict"]
        update_cycle_manifest(cycle_manifest_path, cycle_manifest, state=state)

        print(f"Cycle manifest: {cycle_manifest_path}")
        print(f"Maintainer packet: {packet_path}")
        print(f"Candidate metadata: {candidate_metadata_path}")
        print(f"Replay campaign: {replay_candidate_dir}")
        print(f"Comparison JSON: {comparison_path}")
        print(f"Comparison MD: {comparison_dir / 'comparison.md'}")
    except Exception as exc:
        cycle_manifest["finishedAt"] = utc_now()
        update_cycle_manifest(cycle_manifest_path, cycle_manifest, state="BLOCKED", blocking_reason=str(exc))
        raise


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
