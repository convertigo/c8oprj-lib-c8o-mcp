#!/usr/bin/env python3
import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


PROTOCOL_VERSION = "2025-06-18"
DEFAULT_MCP_URL = "http://localhost:18080/convertigo/api/mcp"
POSTGRES_FIXTURE_ID = "postgres-v1"
POSTGRES_DEFAULTS = {
    "host": "127.0.0.1",
    "database": "convertigo_bench",
    "user": "bench",
    "password": "bench",
}


def repo_root():
    return Path(__file__).resolve().parents[2]


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def parse_args():
    root = repo_root()
    parser = argparse.ArgumentParser(description="Run one Phase 4 benchmark campaign.")
    parser.add_argument(
        "--suite",
        default=str(root / "tests" / "benchmarks" / "suites" / "phase4_v1.json"),
        help="Path to the benchmark suite manifest.",
    )
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL, help="Convertigo MCP endpoint.")
    parser.add_argument("--campaign-root", default=str(root / "tests" / "campaigns"), help="Campaign output root.")
    parser.add_argument("--only-scenarios", default="", help="Comma-separated list of scenarioIds to run.")
    parser.add_argument("--model", default=os.environ.get("CODEX_MODEL", ""), help="Codex model override.")
    parser.add_argument(
        "--reasoning-effort",
        default=os.environ.get("CODEX_REASONING_EFFORT", "medium"),
        help="Codex reasoning effort.",
    )
    parser.add_argument(
        "--request-timeout",
        type=int,
        default=int(os.environ.get("CODEX_REQUEST_TIMEOUT", "900")),
        help="Codex request timeout in seconds.",
    )
    parser.add_argument(
        "--codex-bin",
        default=os.environ.get("CODEX_BIN", ""),
        help="Optional Codex binary override.",
    )
    return parser.parse_args()


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, payload):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def run_command(args, cwd=None, env=None):
    return subprocess.run(args, cwd=cwd, env=env, text=True, capture_output=True)


def git_output(*args):
    result = run_command(["git", *args], cwd=repo_root())
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


def get_project_version():
    text = (repo_root() / "c8oProject.yaml").read_text(encoding="utf-8")
    for line in text.splitlines():
        match = re.match(r"^\s{2}version:\s*(\S+)\s*$", line)
        if match:
            return match.group(1)
    raise RuntimeError("Could not find project version in c8oProject.yaml")


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


def get_mcp_server_version(url):
    response = call_mcp(url, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
    return response.get("result", {}).get("serverInfo", {}).get("version")


def get_codex_version(codex_bin):
    binary = codex_bin or "codex"
    result = run_command([binary, "--version"])
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


def build_candidate_id(project_version, git_short_sha):
    return f"{project_version}+{git_short_sha}"


def allocate_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def sanitize_compose_project_name(text):
    cleaned = re.sub(r"[^a-z0-9]", "", text.lower())
    return cleaned[:48] or "convertigobench"


def render_prompt(template_path, output_path, replacements):
    text = Path(template_path).read_text(encoding="utf-8")
    for key, value in replacements.items():
        text = text.replace(key, value)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text, encoding="utf-8")
    return output_path


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


def setup_postgres_fixture(candidate_dir, run_id):
    fixture_root = repo_root() / "tests" / "fixtures" / "sql" / POSTGRES_FIXTURE_ID
    runtime_dir = candidate_dir / "fixtures" / "sql" / run_id
    runtime_dir.mkdir(parents=True, exist_ok=True)

    port = allocate_port()
    compose_project_name = sanitize_compose_project_name(f"{candidate_dir.name}_{run_id}")
    env_file = runtime_dir / "fixture.env"
    env_file.write_text(
        "\n".join(
            [
                f"COMPOSE_PROJECT_NAME={compose_project_name}",
                f"POSTGRES_PORT={port}",
                f"POSTGRES_DB={POSTGRES_DEFAULTS['database']}",
                f"POSTGRES_USER={POSTGRES_DEFAULTS['user']}",
                f"POSTGRES_PASSWORD={POSTGRES_DEFAULTS['password']}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    metadata = {
        "fixtureId": POSTGRES_FIXTURE_ID,
        "host": POSTGRES_DEFAULTS["host"],
        "port": port,
        "database": POSTGRES_DEFAULTS["database"],
        "user": POSTGRES_DEFAULTS["user"],
        "password": POSTGRES_DEFAULTS["password"],
        "composeProjectName": compose_project_name,
        "runtimeDir": str(runtime_dir.resolve()),
        "composeFile": str((fixture_root / "docker-compose.yml").resolve()),
        "startedAt": utc_now(),
    }
    write_json(runtime_dir / "metadata.json", metadata)

    result = run_command(["bash", str(fixture_root / "reset.sh"), "up", str(runtime_dir)], cwd=repo_root())
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return metadata


def teardown_postgres_fixture(runtime_dir):
    fixture_root = repo_root() / "tests" / "fixtures" / "sql" / POSTGRES_FIXTURE_ID
    result = run_command(["bash", str(fixture_root / "reset.sh"), "down", str(runtime_dir)], cwd=repo_root())
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())


def run_prompt(prompt_file, run_label, role_prompt_name, workspace_dir, artifact_dir_root, env_overrides):
    env = os.environ.copy()
    env.update(env_overrides)
    env["WORKSPACE_DIR"] = str(workspace_dir)
    env["ARTIFACT_DIR_ROOT"] = str(artifact_dir_root)
    command = ["bash", "tests/run_prompt.sh", str(prompt_file), run_label]
    if role_prompt_name:
        command.append(role_prompt_name)
    result = run_command(command, cwd=repo_root(), env=env)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    parsed = parse_run_prompt_output(result.stdout)
    if not parsed.get("reportPath"):
        raise RuntimeError(f"run_prompt.sh did not print report path for {run_label}")
    parsed["stdout"] = result.stdout
    parsed["report"] = load_json(parsed["reportPath"])
    return parsed


def scenario_run_env(
    args,
    suite_id,
    candidate_id,
    scenario_id,
    benchmark_id,
    workspace_id,
    fixture_id="",
    critic_target_run_id="",
    run_stamp="",
):
    env = {
        "SUITE_ID": suite_id,
        "CANDIDATE_ID": candidate_id,
        "SCENARIO_ID": scenario_id,
        "BENCHMARK_ID": benchmark_id,
        "WORKSPACE_ID": workspace_id,
        "CODEX_REASONING_EFFORT": args.reasoning_effort,
        "CODEX_REQUEST_TIMEOUT": str(args.request_timeout),
        "MCP_URL": args.mcp_url,
    }
    if args.model:
        env["CODEX_MODEL"] = args.model
    if args.codex_bin:
        env["CODEX_BIN"] = args.codex_bin
    if run_stamp:
        env["RUN_STAMP"] = run_stamp
    if fixture_id:
        env["FIXTURE_ID"] = fixture_id
    if critic_target_run_id:
        env["CRITIC_TARGET_RUN_ID"] = critic_target_run_id
    return env


def update_manifest(path, manifest):
    write_json(path, manifest)


def build_run_record(scenario, run_data, workspace_id, fixture_metadata_path=None):
    return {
        "scenarioId": scenario["scenarioId"],
        "benchmarkId": scenario["benchmarkId"],
        "rolePromptName": scenario["rolePromptName"],
        "runId": run_data["runId"],
        "logPath": run_data["logPath"],
        "reportPath": run_data["reportPath"],
        "summaryPath": run_data["summaryPath"],
        "workspaceId": workspace_id,
        "fixtureId": scenario["fixtureId"],
        "fixtureMetadataPath": fixture_metadata_path,
        "status": run_data["report"]["result"]["status"],
    }


def main():
    args = parse_args()
    root = repo_root()
    suite_path = Path(args.suite).resolve()
    suite = load_json(suite_path)
    selected = {item.strip() for item in args.only_scenarios.split(",") if item.strip()}
    scenarios = [scenario for scenario in suite["scenarios"] if not selected or scenario["scenarioId"] in selected]
    if not scenarios:
        raise RuntimeError("No scenarios selected for campaign.")

    project_version = get_project_version()
    git_sha = git_output("rev-parse", "HEAD")
    git_short_sha = git_output("rev-parse", "--short", "HEAD")
    candidate_id = build_candidate_id(project_version, git_short_sha)
    campaign_dir = Path(args.campaign_root).resolve() / candidate_id
    if campaign_dir.exists():
        shutil.rmtree(campaign_dir)
    campaign_dir.mkdir(parents=True, exist_ok=True)

    codex_version = get_codex_version(args.codex_bin)
    mcp_server_version = get_mcp_server_version(args.mcp_url)
    manifest_path = campaign_dir / "manifest.json"
    manifest = {
        "candidateId": candidate_id,
        "gitSha": git_sha,
        "projectVersion": project_version,
        "suiteId": suite["suiteId"],
        "runner": "codex-cli",
        "provider": None,
        "model": args.model or None,
        "reasoningEffort": args.reasoning_effort,
        "codexVersion": codex_version,
        "mcpServerVersion": mcp_server_version,
        "startedAt": utc_now(),
        "finishedAt": None,
        "suitePath": str(suite_path),
        "runs": [],
        "aggregateCritic": None,
    }
    update_manifest(manifest_path, manifest)

    generated_prompts_dir = campaign_dir / "generated_prompts"
    run_records = []

    for scenario in scenarios:
        scenario_id = scenario["scenarioId"]
        run_label = scenario_id
        run_stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_id = f"{run_label}_{run_stamp}"
        workspace_id = f"{scenario_id}-workspace"
        workspace_dir = campaign_dir / "workspaces" / scenario_id / workspace_id
        workspace_dir.mkdir(parents=True, exist_ok=True)

        fixture_metadata = None
        prompt_path = root / scenario["promptFile"]
        if scenario["requiresFixture"] and scenario["fixtureId"] == POSTGRES_FIXTURE_ID:
            fixture_metadata = setup_postgres_fixture(campaign_dir, run_id)
            prompt_path = render_prompt(
                root / scenario["promptFile"],
                generated_prompts_dir / f"{scenario_id}.txt",
                {
                    "__PG_HOST__": fixture_metadata["host"],
                    "__PG_PORT__": str(fixture_metadata["port"]),
                    "__PG_DATABASE__": fixture_metadata["database"],
                    "__PG_USER__": fixture_metadata["user"],
                    "__PG_PASSWORD__": fixture_metadata["password"],
                    "__FIXTURE_METADATA_PATH__": str((Path(fixture_metadata["runtimeDir"]) / "metadata.json").resolve()),
                },
            )

        try:
            run_data = run_prompt(
                prompt_path,
                run_label,
                scenario["rolePromptName"],
                workspace_dir,
                campaign_dir / "runs" / scenario_id,
                scenario_run_env(
                    args,
                    suite["suiteId"],
                    candidate_id,
                    scenario_id,
                    scenario["benchmarkId"],
                    workspace_id,
                    scenario["fixtureId"] or "",
                    run_stamp=run_stamp,
                ),
            )
        finally:
            if fixture_metadata is not None:
                teardown_postgres_fixture(Path(fixture_metadata["runtimeDir"]))

        run_record = build_run_record(
            scenario,
            run_data,
            workspace_id,
            str((Path(fixture_metadata["runtimeDir"]) / "metadata.json").resolve()) if fixture_metadata else None,
        )
        run_records.append(run_record)
        manifest["runs"] = run_records
        if manifest["provider"] is None:
            manifest["provider"] = run_data["report"]["provider"]
        if manifest["model"] is None:
            manifest["model"] = run_data["report"]["model"]
        update_manifest(manifest_path, manifest)

        critic_prompt_path = render_prompt(
            root / scenario["criticPromptFile"],
            generated_prompts_dir / f"{scenario_id}_critic.txt",
            {
                "__RUN_REPORT_PATH__": str(Path(run_data["reportPath"]).resolve()),
                "__RUN_SUMMARY_PATH__": str(Path(run_data["summaryPath"]).resolve()),
                "__RAW_LOG_PATH__": str(Path(run_data["logPath"]).resolve()),
                "__CANDIDATE_ID__": candidate_id,
                "__SCENARIO_ID__": scenario_id,
                "__RUN_ID__": run_data["runId"],
            },
        )
        critic_run_stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        critic_data = run_prompt(
            critic_prompt_path,
            f"{scenario_id}_critic",
            "convertigo-critic",
            campaign_dir / "workspaces" / scenario_id / f"critic-{run_data['runId']}",
            campaign_dir / "critics" / scenario_id,
            scenario_run_env(
                args,
                suite["suiteId"],
                candidate_id,
                scenario_id,
                f"{scenario['benchmarkId']}/critic-run",
                f"critic-{run_data['runId']}",
                critic_target_run_id=run_data["runId"],
                run_stamp=critic_run_stamp,
            ),
        )

        run_record["criticRunId"] = critic_data["runId"]
        run_record["criticReportPath"] = critic_data["reportPath"]
        run_record["criticSummaryPath"] = critic_data["summaryPath"]
        run_record["criticStatus"] = critic_data["report"]["result"]["status"]
        update_manifest(manifest_path, manifest)

    run_report_list = "\n".join(f"- `{item['reportPath']}`" for item in run_records)
    critic_report_list = "\n".join(f"- `{item['criticReportPath']}`" for item in run_records)
    aggregate_prompt_path = render_prompt(
        root / suite["aggregateCriticPromptFile"],
        generated_prompts_dir / "aggregate_critic.txt",
        {
            "__CAMPAIGN_MANIFEST_PATH__": str(manifest_path.resolve()),
            "__RUN_REPORT_LIST__": run_report_list or "- none",
            "__CRITIC_REPORT_LIST__": critic_report_list or "- none",
        },
    )
    aggregate_run_stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    aggregate_critic_data = run_prompt(
        aggregate_prompt_path,
        "aggregate_critic",
        "convertigo-critic",
        campaign_dir / "workspaces" / "aggregate" / "critic",
        campaign_dir / "aggregate" / "critic",
        scenario_run_env(
            args,
            suite["suiteId"],
            candidate_id,
            "aggregate-critic",
            f"{suite['suiteId']}/aggregate-critic",
            "aggregate-critic",
            run_stamp=aggregate_run_stamp,
        ),
    )
    manifest["aggregateCritic"] = {
        "runId": aggregate_critic_data["runId"],
        "reportPath": aggregate_critic_data["reportPath"],
        "summaryPath": aggregate_critic_data["summaryPath"],
        "status": aggregate_critic_data["report"]["result"]["status"],
    }
    manifest["finishedAt"] = utc_now()
    update_manifest(manifest_path, manifest)

    score_result = run_command(
        [
            "python3",
            str(root / "tests" / "scripts" / "score_campaign.py"),
            "--campaign-dir",
            str(campaign_dir),
            "--suite",
            str(suite_path),
        ],
        cwd=root,
    )
    if score_result.returncode != 0:
        raise RuntimeError(score_result.stderr.strip() or score_result.stdout.strip())

    print(f"CandidateId: {candidate_id}")
    print(f"Campaign: {campaign_dir}")
    print(f"Manifest: {manifest_path}")
    print(score_result.stdout.strip())


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
