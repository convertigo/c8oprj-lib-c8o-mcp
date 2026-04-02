#!/usr/bin/env python3
import argparse
import http.cookiejar
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen


SCHEMA_VERSION = "1.1.0"
DEFAULT_MCP_URL = os.environ.get("CONVERTIGO_MCP_URL", "http://localhost:18080/convertigo/api/mcp")
DEFAULT_ADMIN_USER = os.environ.get("CONVERTIGO_ADMIN_USER", "admin")
DEFAULT_ADMIN_PASSWORD = os.environ.get("CONVERTIGO_ADMIN_PASSWORD", "admin")
DEFAULT_RUNTIME_PROJECT = os.environ.get("CONVERTIGO_RUNTIME_PROJECT", "ConvertigoMCP")
MAINTAINER_PROMPT_NAME = "convertigo-maintainer"
PROTOCOL_VERSION = "2025-06-18"
FINDING_SPECS = {
    "finding-httpconnector-port-coercion": {
        "targetedScenarios": ["http-facade-integration-v1"],
        "benchmarkPatterns": [
            r"port coercion",
            r"numeric connector ports",
            r"materializ(?:ed|ing) runtime port `0`",
            r"silently materializing `0`",
        ],
        "verification": "http-port-coercion",
        "selectionReason": (
            "Selected finding-httpconnector-port-coercion because the latest feedback triage marks it as an "
            "MCP-owned maintainer candidate and historical benchmark evidence already corroborates the same numeric "
            "HttpConnector.port coercion bug. All unrelated open findings remain out of scope for this cycle."
        ),
    },
    "finding-ngx-ui-control-directive-wrapper-semantics": {
        "targetedScenarios": ["ngx-contract-ui-v1"],
        "benchmarkPatterns": [
            r"directive-node semantics",
            r"directive composition",
            r"invalid angular output",
            r"duplicated `\*ngfor`",
            r"duplicated \*ngfor",
            r"empty sibling `ng-container`",
            r"empty sibling ng-container",
            r"broken `\*ngif`/`\*ngfor` generation",
            r"broken \*ngif/\*ngfor generation",
            r"wrapper semantics",
        ],
        "verification": "ngx-directive-wrapper",
        "selectionReason": (
            "Selected finding-ngx-ui-control-directive-wrapper-semantics because the latest feedback triage marks it "
            "as an MCP-owned maintainer candidate and the rejected cycle-001 full replay already shows the same NGX "
            "directive-wrapper failure in benchmark evidence. All unrelated open findings remain out of scope for "
            "this cycle."
        ),
    },
}
PORT_COERCION_PATTERNS = [
    r"materializ(?:ed|ing) runtime port `0`",
    r"silently materializing `0`",
    r"numeric connector ports",
    r"resent as string",
    r"HttpConnector\.port=443.*port `0`",
]
NGX_DIRECTIVE_WRAPPER_PATTERNS = [
    r"invalid angular output",
    r"duplicated `\*ngfor`",
    r"duplicated \*ngfor",
    r"empty sibling `ng-container`",
    r"empty sibling ng-container",
    r"directive-node semantics",
    r"directive composition",
    r"wrapper semantics",
    r"broken `\*ngif`/`\*ngfor` generation",
    r"broken \*ngif/\*ngfor generation",
]


def repo_root():
    return Path(__file__).resolve().parents[2]


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def parse_args():
    root = repo_root()
    parser = argparse.ArgumentParser(description="Run one Phase 5 improvement cycle.")
    parser.add_argument("--baseline-campaign-dir", required=True, help="Path to the baseline Phase 4 campaign directory.")
    parser.add_argument(
        "--feedback-consolidation",
        default="",
        help="Optional explicit feedback consolidation JSON. Defaults to the latest completed triage batch.",
    )
    parser.add_argument("--finding-id", required=True, help="The single MCP-owned finding to target in this cycle.")
    parser.add_argument("--improvement-root", default=str(root / "tests" / "improvement"), help="Improvement output root.")
    parser.add_argument("--cycle-id", default="cycle-001", help="Cycle identifier, for example cycle-001.")
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL, help="Convertigo MCP endpoint for the candidate runtime.")
    parser.add_argument("--admin-user", default=DEFAULT_ADMIN_USER, help="Convertigo admin username for MCP recovery fallback.")
    parser.add_argument("--admin-password", default=DEFAULT_ADMIN_PASSWORD, help="Convertigo admin password for MCP recovery fallback.")
    parser.add_argument("--runtime-project", default=DEFAULT_RUNTIME_PROJECT, help="Convertigo runtime project name to reload if the MCP endpoint disappears.")
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


def call_mcp(url, payload, timeout=10):
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "MCP-Protocol-Version": PROTOCOL_VERSION,
        },
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        return json.load(response)


def admin_service_base_url(mcp_url):
    marker = "/api/mcp"
    if marker not in mcp_url:
        raise RuntimeError(f"Unsupported MCP URL for admin fallback: {mcp_url}")
    return mcp_url.split(marker, 1)[0]


def call_admin_service(mcp_url, service_name, query=None, timeout=30, admin_user=DEFAULT_ADMIN_USER, admin_password=DEFAULT_ADMIN_PASSWORD):
    if not admin_user or not admin_password:
        raise RuntimeError("Convertigo admin credentials are required for MCP recovery fallback.")
    base_url = admin_service_base_url(mcp_url)
    jar = http.cookiejar.CookieJar()
    opener = build_opener(HTTPCookieProcessor(jar))
    auth_query = urlencode(
        {
            "authType": "login",
            "authUserName": admin_user,
            "authPassword": admin_password,
        }
    )
    with opener.open(f"{base_url}/admin/services/engine.Authenticate?{auth_query}", timeout=timeout) as response:
        auth_body = response.read().decode("utf-8", "replace")
    if "<authenticated>true</authenticated>" not in auth_body:
        raise RuntimeError("Convertigo admin authentication failed during MCP recovery fallback.")
    service_url = f"{base_url}/admin/services/{service_name}"
    if query:
        service_url = f"{service_url}?{urlencode(query)}"
    with opener.open(service_url, timeout=timeout) as response:
        return response.read().decode("utf-8", "replace")


def recover_mcp_endpoint(mcp_url, runtime_project, admin_user, admin_password):
    body = call_admin_service(
        mcp_url,
        "projects.Reload",
        {"projectName": runtime_project},
        timeout=60,
        admin_user=admin_user,
        admin_password=admin_password,
    )
    if "<success>" not in body:
        raise RuntimeError(f"Convertigo admin project reload did not report success for {runtime_project}.")


def call_mcp_tool(url, tool_name, arguments=None, timeout=30):
    response = call_mcp(
        url,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments or {},
            },
        },
        timeout=timeout,
    )
    if "error" in response:
        error = response["error"]
        detail = error.get("details") or error.get("message") or json.dumps(error)
        raise RuntimeError(f"{tool_name} failed: {detail}")
    return response.get("result", {})


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


def normalize_benchmark_finding(item):
    normalized = dict(item)
    normalized["recommendedOwner"] = canonical_owner(item.get("recommendedOwner"))
    return normalized


def severity_to_int(value):
    if isinstance(value, int):
        return max(1, min(3, value))
    mapping = {"low": 1, "medium": 2, "high": 3}
    return mapping.get(str(value).lower(), 1)


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


def create_worktree(root, branch_name, worktree_path, base_ref):
    if worktree_path.exists():
        raise RuntimeError(f"Worktree path already exists: {worktree_path}")
    existing = run_command(["git", "show-ref", "--verify", f"refs/heads/{branch_name}"], cwd=root)
    if existing.returncode == 0:
        raise RuntimeError(f"Branch already exists: {branch_name}")
    result = run_command(["git", "worktree", "add", "-b", branch_name, str(worktree_path), base_ref], cwd=root)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())


def improvement_branch_name(root, baseline_candidate_id, cycle_id):
    preferred = f"codex/candidate-{baseline_candidate_id}-{cycle_id}"
    namespace_probe = run_command(["git", "show-ref", "--verify", "refs/heads/codex"], cwd=root)
    if namespace_probe.returncode == 0:
        return f"codex-candidate-{baseline_candidate_id}-{cycle_id}"
    return preferred


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


def candidate_changed_paths(worktree_path, baseline_git_sha, candidate_sha):
    output = git_output(worktree_path, "diff", "--name-only", f"{baseline_git_sha}..{candidate_sha}")
    return [line.strip() for line in output.splitlines() if line.strip()]


def restore_paths_from_ref(repo_dir, ref, paths):
    if not paths:
        return
    result = run_command(
        ["git", "restore", "--source", ref, "--worktree", "--staged", "--", *paths],
        cwd=repo_dir,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())


def reload_runtime_project(url, project=DEFAULT_RUNTIME_PROJECT, admin_user=DEFAULT_ADMIN_USER, admin_password=DEFAULT_ADMIN_PASSWORD):
    try:
        call_mcp_tool(
            url,
            "project-reload",
            {
                "project": project,
            },
            timeout=120,
        )
    except Exception as exc:
        if isinstance(exc, HTTPError) and exc.code == 404 or "HTTP Error 404" in str(exc):
            recover_mcp_endpoint(url, project, admin_user, admin_password)
            return
        raise


def latest_feedback_consolidation(root):
    candidates = sorted((root / "feedback" / "triage").glob("*/consolidation.json"))
    if not candidates:
        return None
    return candidates[-1]


def resolve_feedback_consolidation(root, explicit_path):
    if explicit_path:
        path = Path(explicit_path).resolve()
        if not path.is_file():
            raise RuntimeError(f"Feedback consolidation does not exist: {path}")
        return path
    latest = latest_feedback_consolidation(root)
    if latest is None:
        raise RuntimeError("No completed feedback consolidation was found.")
    return latest.resolve()


def select_benchmark_top_findings(top_findings):
    allowed = {"tool", "guide", "prompt", "scenario", "fixture"}
    normalized = [normalize_benchmark_finding(item) for item in top_findings]
    selected = [item for item in normalized if item.get("recommendedOwner") in allowed]
    selected.sort(key=lambda item: (-item["severity"], -item["count"], item["area"], item["subjectId"], item["symptom"]))
    return normalized, selected[:5]


def build_scenario_summary(manifest, aggregate):
    summary = []
    by_run_id = {item["runId"]: item for item in manifest.get("runs", [])}
    for item in aggregate.get("scenarioResults", []):
        run_record = by_run_id.get(item["runId"], {})
        summary.append(
            {
                "scenarioId": item["scenarioId"],
                "runId": item["runId"],
                "status": item["status"],
                "gateStatus": item["gateStatus"],
                "score": item["score"],
                "weightedScore": item["weightedScore"],
                "runReportPath": item.get("runReportPath") or run_record.get("reportPath"),
                "criticReportPath": item.get("criticReportPath") or run_record.get("criticReportPath"),
            }
        )
    return summary


def collect_evidence_paths(manifest, selected_run_ids):
    runs_by_id = {item["runId"]: item for item in manifest.get("runs", [])}
    return {
        "campaignManifest": str(Path(manifest["__manifest_path__"]).resolve()),
        "aggregateFindings": str(Path(manifest["__aggregate_path__"]).resolve()),
        "runReports": [runs_by_id[run_id]["reportPath"] for run_id in selected_run_ids if runs_by_id.get(run_id, {}).get("reportPath")],
        "runSummaries": [runs_by_id[run_id]["summaryPath"] for run_id in selected_run_ids if runs_by_id.get(run_id, {}).get("summaryPath")],
        "criticReports": [
            runs_by_id[run_id]["criticReportPath"]
            for run_id in selected_run_ids
            if runs_by_id.get(run_id, {}).get("criticReportPath")
        ],
        "rawLogs": [runs_by_id[run_id]["logPath"] for run_id in selected_run_ids if runs_by_id.get(run_id, {}).get("logPath")],
    }


def build_relevant_context(root, role_prompt_name):
    prompts = prompt_catalog(root)
    relevant_prompts = []
    relevant_guides = [
        "convertigo/start@1",
        "convertigo/engineering-workflow@1",
        "convertigo/validation-and-evidence@1",
    ]
    if role_prompt_name:
        relevant_prompts.append(role_prompt_name)
        role = prompts.get(role_prompt_name)
        if role:
            for guide_id in role.get("guideIds", []):
                if guide_id not in relevant_guides:
                    relevant_guides.append(guide_id)
    if MAINTAINER_PROMPT_NAME not in relevant_prompts:
        relevant_prompts.append(MAINTAINER_PROMPT_NAME)
    return relevant_guides, relevant_prompts


def find_feedback_finding(consolidation, finding_id):
    for item in consolidation.get("groupedFindings", []):
        if item.get("findingId") == finding_id:
            return item
    return None


def finding_spec(finding_id):
    return FINDING_SPECS.get(finding_id)


def benchmark_keyword_patterns(finding_id):
    spec = finding_spec(finding_id)
    if not spec:
        return []
    return spec.get("benchmarkPatterns", [])


def file_matches_patterns(path, patterns):
    if not path.is_file():
        return False
    text = path.read_text(encoding="utf-8")
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in patterns)


def collect_candidate_benchmark_paths(root, baseline_campaign_dir, baseline_manifest, finding_id):
    patterns = benchmark_keyword_patterns(finding_id)
    if not patterns:
        return []
    candidate_paths = []
    aggregate_critic_dir = baseline_campaign_dir / "aggregate" / "critic"
    if aggregate_critic_dir.is_dir():
        for path in sorted(aggregate_critic_dir.glob("*/report.json")) + sorted(aggregate_critic_dir.glob("*_critic_*/report.json")):
            if file_matches_patterns(path, patterns):
                candidate_paths.append(path)
    for run in baseline_manifest.get("runs", []):
        for key in ("reportPath", "summaryPath", "criticReportPath"):
            value = run.get(key)
            if value:
                path = Path(value)
                if file_matches_patterns(path, patterns):
                    candidate_paths.append(path)
    if candidate_paths:
        return sorted({str(path.resolve()) for path in candidate_paths})

    for search_root in (root / "tests" / "campaigns", root / "tests" / "improvement"):
        if search_root.is_dir():
            for path in sorted(search_root.rglob("report.json")):
                if file_matches_patterns(path, patterns):
                    candidate_paths.append(path)
            for path in sorted(search_root.rglob("summary.md")):
                if file_matches_patterns(path, patterns):
                    candidate_paths.append(path)
    return sorted({str(path.resolve()) for path in candidate_paths})


def selected_finding_for_cycle(root, baseline_campaign_dir, baseline_manifest, baseline_aggregate, consolidation, finding_id):
    feedback_finding = find_feedback_finding(consolidation, finding_id)
    if feedback_finding is None:
        raise RuntimeError(f"Feedback consolidation does not contain finding id: {finding_id}")
    if feedback_finding.get("targetRepo") != "c8oprj-c8o-mcp":
        raise RuntimeError(f"Finding {finding_id} is not owned by this repo.")
    if canonical_owner(feedback_finding.get("recommendedOwner")) not in {"tool", "guide", "prompt", "scenario", "fixture"}:
        raise RuntimeError(f"Finding {finding_id} is not owned by a maintainer-eligible area.")

    spec = finding_spec(finding_id)
    if not spec:
        raise RuntimeError(f"No finding spec is configured for finding: {finding_id}")
    targeted_scenarios = spec.get("targetedScenarios")
    if not targeted_scenarios:
        raise RuntimeError(f"No targeted replay scenario is configured for finding: {finding_id}")

    scenario_summary = build_scenario_summary(baseline_manifest, baseline_aggregate)
    scenario_run_ids = [
        item["runId"]
        for item in scenario_summary
        if item["scenarioId"] in targeted_scenarios
    ]
    benchmark_evidence_paths = collect_candidate_benchmark_paths(root, baseline_campaign_dir, baseline_manifest, finding_id)
    if not benchmark_evidence_paths:
        raise RuntimeError(f"Finding {finding_id} is not corroborated by benchmark evidence.")

    selected = {
        "findingId": finding_id,
        "area": feedback_finding["area"],
        "subjectId": feedback_finding["subjectId"],
        "symptom": feedback_finding["symptom"],
        "severity": severity_to_int(feedback_finding["severity"]),
        "recommendedOwner": canonical_owner(feedback_finding["recommendedOwner"]),
        "targetRepo": feedback_finding["targetRepo"],
        "nextAction": feedback_finding.get("nextAction"),
        "sourceReportIds": feedback_finding.get("sourceReportIds", []),
        "scenarioIds": targeted_scenarios,
        "evidenceRunIds": scenario_run_ids,
        "providers": [baseline_manifest.get("provider")] if baseline_manifest.get("provider") else [],
        "models": [baseline_manifest.get("model")] if baseline_manifest.get("model") else [],
        "benchmarkEvidencePaths": benchmark_evidence_paths,
        "feedbackEvidencePaths": feedback_finding.get("evidencePaths", []),
    }
    return selected, targeted_scenarios, scenario_run_ids


def build_packet(root, baseline_campaign_dir, baseline_manifest, baseline_aggregate, feedback_consolidation, finding_id):
    top_findings, _ = select_benchmark_top_findings(baseline_aggregate.get("topFindings", []))
    selected, targeted_scenarios, selected_run_ids = selected_finding_for_cycle(
        root,
        baseline_campaign_dir,
        baseline_manifest,
        baseline_aggregate,
        feedback_consolidation,
        finding_id,
    )
    baseline_http_run = next((item for item in baseline_manifest.get("runs", []) if item["scenarioId"] in targeted_scenarios), None)
    role_prompt_name = baseline_http_run["rolePromptName"] if baseline_http_run else None
    relevant_guides, relevant_prompts = build_relevant_context(root, role_prompt_name)
    selection_reason = finding_spec(finding_id)["selectionReason"]
    packet = {
        "schemaVersion": SCHEMA_VERSION,
        "baselineCandidateId": baseline_manifest["candidateId"],
        "baselineGitSha": baseline_manifest["gitSha"],
        "suiteId": baseline_manifest["suiteId"],
        "provider": baseline_manifest.get("provider"),
        "model": baseline_manifest.get("model"),
        "codexVersion": baseline_manifest["codexVersion"],
        "projectVersion": baseline_manifest["projectVersion"],
        "findingSources": [
            {
                "findingId": finding_id,
                "sourceType": "feedback",
                "path": str(Path(path).resolve()),
                "notes": "Latest feedback triage consolidation selected this MCP-owned maintainer candidate.",
            }
            for path in selected["feedbackEvidencePaths"]
        ]
        + [
            {
                "findingId": finding_id,
                "sourceType": "benchmark-history" if baseline_manifest["candidateId"] not in path else "benchmark",
                "path": path,
                "notes": "Benchmark evidence corroborating the same port coercion issue.",
            }
            for path in selected["benchmarkEvidencePaths"]
        ],
        "selectedFindingIds": [finding_id],
        "selectionReason": selection_reason,
        "topFindings": top_findings,
        "selectedFindings": [selected],
        "scenarioSummary": build_scenario_summary(baseline_manifest, baseline_aggregate),
        "relevantGuides": relevant_guides,
        "relevantPrompts": relevant_prompts,
        "allowedMutationAreas": [
            "tool",
            "auto-documentation",
        ],
        "forbiddenMutationAreas": [
            "external-infrastructure",
            "global-provider-config",
            "unrelated-product-work",
            "guide",
            "prompt",
            "scenario",
            "fixture",
        ],
        "benchmarkEvidencePaths": selected["benchmarkEvidencePaths"],
        "feedbackEvidencePaths": selected["feedbackEvidencePaths"],
        "evidencePaths": collect_evidence_paths(baseline_manifest, selected_run_ids),
        "acceptanceTargets": {
            "overallScoreMinDelta": 1.0,
            "maxOverallScoreRegression": 0.1,
            "forbidPassToFail": True,
            "forbidGateFailureIncrease": True,
            "forbidFailCountIncrease": True,
            "requiredRunnerTuple": {
                "provider": baseline_manifest.get("provider"),
                "model": baseline_manifest.get("model"),
                "codexVersion": baseline_manifest["codexVersion"],
            },
            "targetedFindingKeys": [finding_string(selected)],
        },
    }
    return packet, targeted_scenarios


def render_packet_markdown(packet):
    lines = [
        "# Maintainer Packet",
        "",
        f"- Baseline candidate: `{packet['baselineCandidateId']}`",
        f"- Suite: `{packet['suiteId']}`",
        f"- Provider/model: `{packet['provider']}` / `{packet['model']}`",
        f"- Codex version: `{packet['codexVersion']}`",
        f"- Project version: `{packet['projectVersion']}`",
        f"- Selected finding ids: `{', '.join(packet['selectedFindingIds'])}`",
        "",
        "## Selection Reason",
        "",
        packet["selectionReason"],
        "",
        "## Selected Findings",
        "",
    ]
    for item in packet["selectedFindings"]:
        lines.append(
            f"- [{item['findingId']}] `{item['area']}/{item['subjectId']}` severity `{item['severity']}`: {item['symptom']}"
        )
    lines.extend(
        [
            "",
            "## Benchmark Evidence",
            "",
        ]
    )
    for path in packet["benchmarkEvidencePaths"]:
        lines.append(f"- `{path}`")
    lines.extend(
        [
            "",
            "## Feedback Evidence",
            "",
        ]
    )
    for path in packet["feedbackEvidencePaths"]:
        lines.append(f"- `{path}`")
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


def run_campaign(worktree_path, suite_path, campaign_root, args, codex_npm_version, scenario_ids=None):
    command = [
        "python3",
        "tests/scripts/run_campaign.py",
        "--suite",
        str(suite_path),
        "--campaign-root",
        str(campaign_root),
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
        "--reasoning-effort",
        args.reasoning_effort,
    ]
    if scenario_ids:
        command.extend(["--only-scenarios", ",".join(scenario_ids)])
    if args.model:
        command.extend(["--model", args.model])
    if args.codex_bin:
        command.extend(["--codex-bin", args.codex_bin])
    env = os.environ.copy()
    if codex_npm_version:
        env["CODEX_NPM_VERSION"] = codex_npm_version
    result = run_command(command, cwd=worktree_path, env=env)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    campaign_dirs = sorted(Path(campaign_root).glob("*"))
    if not campaign_dirs:
        raise RuntimeError(f"No campaign output was produced under {campaign_root}")
    return campaign_dirs[-1].resolve()


def coercion_issue_present(text):
    return any(re.search(pattern, text or "", flags=re.IGNORECASE) for pattern in PORT_COERCION_PATTERNS)


def verify_targeted_http_replay(campaign_dir):
    manifest = load_json(Path(campaign_dir) / "manifest.json")
    aggregate = load_json(Path(campaign_dir) / "aggregate" / "findings.json")
    if manifest.get("finishedAt") is None:
        raise RuntimeError("Targeted replay campaign manifest is incomplete.")
    if len(aggregate.get("scenarioResults", [])) != 1:
        raise RuntimeError("Targeted replay must contain exactly one scenario.")
    result = aggregate["scenarioResults"][0]
    if result["status"] != "PASS" or result["gateStatus"] != "PASS":
        raise RuntimeError("Targeted replay did not pass cleanly.")
    report_path = Path(result["runReportPath"])
    critic_path = Path(result["criticReportPath"])
    for path in (report_path, critic_path):
        text = path.read_text(encoding="utf-8")
        if coercion_issue_present(text):
            raise RuntimeError(f"Targeted replay still contains HTTP port coercion evidence in {path}.")


def ngx_directive_issue_present(text):
    return any(re.search(pattern, text or "", flags=re.IGNORECASE) for pattern in NGX_DIRECTIVE_WRAPPER_PATTERNS)


def verify_targeted_ngx_replay(campaign_dir):
    manifest = load_json(Path(campaign_dir) / "manifest.json")
    aggregate = load_json(Path(campaign_dir) / "aggregate" / "findings.json")
    if manifest.get("finishedAt") is None:
        raise RuntimeError("Targeted replay campaign manifest is incomplete.")
    if len(aggregate.get("scenarioResults", [])) != 1:
        raise RuntimeError("Targeted replay must contain exactly one scenario.")
    result = aggregate["scenarioResults"][0]
    if result["status"] != "PASS" or result["gateStatus"] != "PASS":
        raise RuntimeError("Targeted replay did not pass cleanly.")
    report_path = Path(result["runReportPath"])
    critic_path = Path(result["criticReportPath"])
    for path in (report_path, critic_path):
        text = path.read_text(encoding="utf-8")
        if ngx_directive_issue_present(text):
            raise RuntimeError(f"Targeted replay still contains NGX directive-wrapper evidence in {path}.")


def verify_targeted_replay(campaign_dir, finding_id):
    verification = finding_spec(finding_id)["verification"]
    if verification == "http-port-coercion":
        verify_targeted_http_replay(campaign_dir)
        return
    if verification == "ngx-directive-wrapper":
        verify_targeted_ngx_replay(campaign_dir)
        return
    raise RuntimeError(f"No targeted replay verification is configured for finding: {finding_id}")


def targeted_rejection_comparison(baseline_campaign_dir, baseline_manifest, baseline_aggregate, targeted_campaign_dir, packet, reasons):
    targeted_manifest = load_json(Path(targeted_campaign_dir) / "manifest.json")
    targeted_aggregate = load_json(Path(targeted_campaign_dir) / "aggregate" / "findings.json")
    scenario_id = finding_spec(packet["selectedFindingIds"][0])["targetedScenarios"][0]

    baseline_results = {item["scenarioId"]: item for item in baseline_aggregate.get("scenarioResults", [])}
    targeted_results = {item["scenarioId"]: item for item in targeted_aggregate.get("scenarioResults", [])}
    baseline_result = baseline_results.get(scenario_id)
    candidate_result = targeted_results.get(scenario_id)

    notes = list(reasons)
    if candidate_result:
        failing = candidate_result.get("failingGates", [])
        if failing:
            notes.append("Targeted replay failing gates: " + ", ".join(failing))

    comparison = {
        "schemaVersion": "1.1.0",
        "baselineCandidateId": baseline_manifest["candidateId"],
        "candidateId": targeted_manifest["candidateId"],
        "baselineCampaignPath": str(Path(baseline_campaign_dir).resolve()),
        "candidateCampaignPath": str(Path(targeted_campaign_dir).resolve()),
        "targetedReplayCampaignPath": str(Path(targeted_campaign_dir).resolve()),
        "suiteId": baseline_manifest["suiteId"],
        "provider": targeted_manifest.get("provider"),
        "model": targeted_manifest.get("model"),
        "overallScoreDelta": round(targeted_aggregate.get("overallScore", 0.0) - baseline_aggregate.get("overallScore", 0.0), 2),
        "passFailSkippedDelta": {
            "passCount": targeted_aggregate.get("passCount", 0) - baseline_aggregate.get("passCount", 0),
            "failCount": targeted_aggregate.get("failCount", 0) - baseline_aggregate.get("failCount", 0),
            "skippedCount": targeted_aggregate.get("skippedCount", 0) - baseline_aggregate.get("skippedCount", 0),
        },
        "gateFailureDelta": targeted_aggregate.get("gateFailureCount", 0) - baseline_aggregate.get("gateFailureCount", 0),
        "averageToolCallsDelta": round(targeted_aggregate.get("averageToolCalls", 0.0) - baseline_aggregate.get("averageToolCalls", 0.0), 2),
        "averageDurationMsDelta": round(targeted_aggregate.get("averageDurationMs", 0.0) - baseline_aggregate.get("averageDurationMs", 0.0), 2),
        "ragCallRateDelta": round(targeted_aggregate.get("ragCallRate", 0.0) - baseline_aggregate.get("ragCallRate", 0.0), 4),
        "findingDelta": {
            "baselineCount": len(baseline_aggregate.get("topFindings", [])),
            "candidateCount": len(targeted_aggregate.get("topFindings", [])),
            "resolvedCount": 0,
            "introducedCount": 0,
            "repeatedCountDelta": 0,
            "targetedResolvedCount": 0,
        },
        "selectedFindingIds": packet.get("selectedFindingIds", []),
        "targetedReplayVerified": False,
        "verdict": "REJECTED",
        "verdictReasons": [
            "Targeted replay failed before full-suite replay.",
            *reasons,
        ],
        "scenarioDeltas": [
            {
                "scenarioId": scenario_id,
                "baselineStatus": None if baseline_result is None else baseline_result.get("status"),
                "candidateStatus": None if candidate_result is None else candidate_result.get("status"),
                "baselineGateStatus": None if baseline_result is None else baseline_result.get("gateStatus"),
                "candidateGateStatus": None if candidate_result is None else candidate_result.get("gateStatus"),
                "scoreDelta": 0.0
                if baseline_result is None or candidate_result is None
                else round(candidate_result.get("score", 0.0) - baseline_result.get("score", 0.0), 2),
                "weightedScoreDelta": 0.0
                if baseline_result is None or candidate_result is None
                else round(candidate_result.get("weightedScore", 0.0) - baseline_result.get("weightedScore", 0.0), 2),
                "notes": notes,
            }
        ],
    }
    return comparison


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
    feedback_consolidation_path = resolve_feedback_consolidation(root, args.feedback_consolidation)
    feedback_consolidation = load_json(feedback_consolidation_path)

    cycle_dir = Path(args.improvement_root).resolve() / baseline_manifest["candidateId"] / args.cycle_id
    if cycle_dir.exists():
        raise RuntimeError(f"Improvement cycle directory already exists: {cycle_dir}")
    cycle_dir.mkdir(parents=True, exist_ok=True)

    branch_name = improvement_branch_name(root, baseline_manifest["candidateId"], args.cycle_id)
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
        "feedbackConsolidationPath": str(feedback_consolidation_path),
        "selectedFindingIds": [args.finding_id],
        "maintainerRun": None,
        "targetedReplayCampaignPath": None,
        "candidate": None,
        "replayCampaignPath": None,
        "comparisonPath": None,
        "blockingReason": None,
    }
    update_cycle_manifest(cycle_manifest_path, cycle_manifest)

    packet, targeted_scenarios = build_packet(
        root,
        baseline_campaign_dir,
        baseline_manifest,
        baseline_aggregate,
        feedback_consolidation,
        args.finding_id,
    )
    write_json(packet_path, packet)
    packet_md_path.write_text(render_packet_markdown(packet), encoding="utf-8")

    create_worktree(root, branch_name, worktree_path, baseline_manifest["gitSha"])

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
        candidate_sha = git_output(worktree_path, "rev-parse", "HEAD")
        if not diff_status.strip():
            if candidate_sha == baseline_manifest["gitSha"]:
                raise RuntimeError("Maintainer run finished without producing any repository diff.")
        else:
            candidate_version = parse_project_version(worktree_path)
            if candidate_version == baseline_version:
                raise RuntimeError("Maintainer run did not bump the project version.")
            candidate_sha = commit_candidate(worktree_path, commit_message)

        candidate_version = parse_project_version(worktree_path)
        if candidate_version == baseline_version:
            raise RuntimeError("Maintainer run did not bump the project version.")

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

        suite_path = worktree_path / Path(baseline_manifest["suitePath"]).relative_to(root)
        changed_paths = candidate_changed_paths(worktree_path, baseline_manifest["gitSha"], candidate_sha)
        runtime_restore_ref = git_output(root, "rev-parse", "HEAD")
        if not changed_paths:
            raise RuntimeError("Could not determine any candidate file changes to deploy for replay.")
        update_cycle_manifest(cycle_manifest_path, cycle_manifest, state="REPLAY_RUNNING")

        targeted_campaign_dir = None
        full_replay_dir = None
        comparison = None
        try:
            restore_paths_from_ref(root, candidate_sha, changed_paths)
            reload_runtime_project(
                args.mcp_url,
                project=args.runtime_project,
                admin_user=args.admin_user,
                admin_password=args.admin_password,
            )

            targeted_campaign_root = replay_root / "targeted"
            targeted_campaign_dir = run_campaign(
                worktree_path,
                suite_path,
                targeted_campaign_root,
                args,
                codex_npm_version,
                scenario_ids=targeted_scenarios,
            )
            cycle_manifest["targetedReplayCampaignPath"] = str(targeted_campaign_dir)
            update_cycle_manifest(cycle_manifest_path, cycle_manifest)
            try:
                verify_targeted_replay(targeted_campaign_dir, args.finding_id)
            except RuntimeError as exc:
                comparison_dir.mkdir(parents=True, exist_ok=True)
                comparison = targeted_rejection_comparison(
                    baseline_campaign_dir,
                    baseline_manifest,
                    baseline_aggregate,
                    targeted_campaign_dir,
                    packet,
                    [str(exc)],
                )
                comparison_path = comparison_dir / "comparison.json"
                write_json(comparison_path, comparison)
                (comparison_dir / "comparison.md").write_text(json.dumps(comparison, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
                cycle_manifest["comparisonPath"] = str(comparison_path)
                cycle_manifest["finishedAt"] = utc_now()
                update_cycle_manifest(cycle_manifest_path, cycle_manifest, state="REJECTED")
                print(f"Cycle manifest: {cycle_manifest_path}")
                print(f"Maintainer packet: {packet_path}")
                print(f"Candidate metadata: {candidate_metadata_path}")
                print(f"Targeted replay campaign: {targeted_campaign_dir}")
                print(f"Comparison JSON: {comparison_path}")
                print(f"Comparison MD: {comparison_dir / 'comparison.md'}")
                return

            full_campaign_root = replay_root / "full"
            full_replay_dir = run_campaign(
                worktree_path,
                suite_path,
                full_campaign_root,
                args,
                codex_npm_version,
            )
            cycle_manifest["replayCampaignPath"] = str(full_replay_dir)
            update_cycle_manifest(cycle_manifest_path, cycle_manifest)

            compare_command = [
                "python3",
                str(root / "tests" / "scripts" / "compare_campaigns.py"),
                "--baseline-campaign-dir",
                str(baseline_campaign_dir),
                "--candidate-campaign-dir",
                str(full_replay_dir),
                "--targeted-replay-campaign-dir",
                str(targeted_campaign_dir),
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
        finally:
            restore_paths_from_ref(root, runtime_restore_ref, changed_paths)
            reload_runtime_project(
                args.mcp_url,
                project=args.runtime_project,
                admin_user=args.admin_user,
                admin_password=args.admin_password,
            )

        cycle_manifest["finishedAt"] = utc_now()
        update_cycle_manifest(cycle_manifest_path, cycle_manifest, state=comparison["verdict"])

        print(f"Cycle manifest: {cycle_manifest_path}")
        print(f"Maintainer packet: {packet_path}")
        print(f"Candidate metadata: {candidate_metadata_path}")
        print(f"Targeted replay campaign: {targeted_campaign_dir}")
        print(f"Full replay campaign: {full_replay_dir}")
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
