#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path("/Users/nicolas/git/c8oprj-c8o-mcp")
DEFAULT_MCP_URL = "http://localhost:18080/convertigo/api/mcp"
PROTOCOL_VERSION = "2025-06-18"


def call_mcp(url, payload, timeout=60):
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


def wait_for_mcp_ready(url, timeout=60):
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            response = call_mcp(
                url,
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/list",
                    "params": {},
                },
                timeout=10,
            )
            if "result" in response:
                return
        except Exception as error:
            last_error = error
        time.sleep(2)
    raise RuntimeError(f"MCP endpoint did not become ready: {last_error}")


def call_tool(url, tool_name, arguments=None, timeout=120):
    response = call_mcp(
        url,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments or {}},
        },
        timeout=timeout,
    )
    if "error" in response:
        raise RuntimeError(f"{tool_name} failed: {response['error'].get('details') or response['error'].get('message')}")
    result = response.get("result", {})
    structured = result.get("structuredContent")
    if structured is not None:
      return structured
    content = result.get("content") or []
    if content and isinstance(content[0], dict) and content[0].get("text"):
        try:
            return json.loads(content[0]["text"])
        except Exception:
            return {"text": content[0]["text"]}
    return result


def run(cmd, cwd=None, env=None):
    return subprocess.run(cmd, cwd=cwd, env=env, text=True, capture_output=True, check=True)


def docker_up(compose_file, env):
    run(["docker", "compose", "-f", str(compose_file), "--project-name", env["COMPOSE_PROJECT_NAME"], "down", "-v", "--remove-orphans"], env=env)
    run(["docker", "compose", "-f", str(compose_file), "--project-name", env["COMPOSE_PROJECT_NAME"], "up", "-d", "--wait"], env=env)


def docker_down(compose_file, env):
    run(["docker", "compose", "-f", str(compose_file), "--project-name", env["COMPOSE_PROJECT_NAME"], "down", "-v", "--remove-orphans"], env=env)


def assert_true(condition, message):
    if not condition:
        raise RuntimeError(message)


def requestable_name(project, connector, tx):
    return f"{project}.{connector}.{tx}"


def unique_project(base):
    return f"{base}_{int(time.time())}"


def load_spec(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def cleanup_project(url, project):
    try:
        call_tool(url, "project-delete", {"project": project})
    except Exception:
        pass


def flatten_tree_names(node, names=None):
    names = names or []
    if isinstance(node, dict):
        name = node.get("name")
        if name:
            names.append(str(name))
        for child in node.get("children") or []:
            flatten_tree_names(child, names)
    return names


def serialize_tree(node):
    return json.dumps(node or {}, ensure_ascii=True, sort_keys=True)


def validate_runtime(url, spec, artifact_dir):
    project = spec["project"]
    connector = spec["database"]["connector"]
    facade_prefix = spec["facade"]["prefix"]
    artifact = {"project": project, "steps": []}

    print(f"[crud-validate] start project={project} driver={spec['database']['mode']}", flush=True)

    cleanup_project(url, project)
    print(f"[crud-validate] cleanup project={project}", flush=True)

    upsert = call_tool(url, "upsert-crud", {"spec": spec, "sequence": True, "ui": False}, timeout=240)
    artifact["steps"].append({"tool": "upsert-crud", "result": upsert})
    assert_true(upsert.get("status") == "success", f"upsert-crud did not succeed for {project}")
    print(f"[crud-validate] upsert-crud ok project={project}", flush=True)

    status1 = call_tool(url, "crud-status", {"project": project, "connector": connector, "facadePrefix": facade_prefix}, timeout=120)
    artifact["steps"].append({"tool": "crud-status-after-upsert", "result": status1})
    assert_true(status1.get("status") == "ok", f"crud-status not ok after upsert for {project}")
    assert_true(not status1.get("transactions", {}).get("missing"), f"Missing transactions after upsert for {project}")
    print(f"[crud-validate] crud-status after upsert ok project={project}", flush=True)

    requestables = ["init_schema", "list_contacts", "count_contacts", "list_companies", "count_companies"]
    for tx in requestables:
        exec_result = call_tool(url, "requestable-execute", {"requestable": requestable_name(project, connector, tx), "variables": "{}"}, timeout=120)
        artifact["steps"].append({"tool": "requestable-execute", "requestable": tx, "result": exec_result})
        print(f"[crud-validate] proof ok project={project} requestable={tx}", flush=True)

    ui_result = call_tool(
        url,
        "upsert-ngx-crud-kit",
        {
            "project": project,
            "entities": spec["entities"],
            "variant": spec["ui"].get("variant", "dashboard"),
            "facadePrefix": facade_prefix,
            "entryPage": spec["ui"].get("entryPage", "Page"),
        },
        timeout=180,
    )
    artifact["steps"].append({"tool": "upsert-ngx-crud-kit", "result": ui_result})
    assert_true(ui_result.get("status") == "success", f"upsert-ngx-crud-kit did not succeed for {project}")
    print(f"[crud-validate] upsert-ngx-crud-kit ok project={project}", flush=True)

    status2 = call_tool(url, "crud-status", {"project": project, "connector": connector, "facadePrefix": facade_prefix}, timeout=120)
    artifact["steps"].append({"tool": "crud-status-final", "result": status2})
    ui = status2.get("ui", {})
    assert_true(ui.get("starterDominant") is False, f"Starter still dominant for {project}")
    assert_true(ui.get("visibleShellPresent") is True, f"Visible shell missing for {project}")
    print(f"[crud-validate] final crud-status ui ok project={project}", flush=True)

    ngx_tree = call_tool(
        url,
        "databaseobject-tree-get",
        {
            "target": f"{project}.Application.NgxApp",
            "childrenDepth": 2,
            "properties": "changed",
            "limit": 400,
        },
        timeout=120,
    )
    artifact["steps"].append({"tool": "databaseobject-tree-get", "target": f"{project}.Application.NgxApp", "result": ngx_tree})
    app_names = set(flatten_tree_names(ngx_tree.get("tree")))
    expected_components = {
        "DashboardStatCard",
        "CrudLoadingState",
        "CrudEmptyState",
        "CrudErrorRetryState",
        "ContactTable",
        "ContactCard",
        "ContactForm",
        "CompanyTable",
        "CompanyCard",
        "CompanyForm",
    }
    missing_components = sorted(expected_components - app_names)
    assert_true(not missing_components, f"Missing shared CRUD components for {project}: {', '.join(missing_components)}")
    print(f"[crud-validate] shared components present project={project}", flush=True)

    page_shared_refs = set((ui_result.get("runtimeEvidence") or {}).get("pageSharedRefs") or [])
    assert_true(
        f"{project}.Application.NgxApp.DashboardStatCard" in page_shared_refs,
        f"Entry page does not use DashboardStatCard in {project}",
    )
    assert_true(
        f"{project}.Application.NgxApp.ContactTable" in page_shared_refs and
        f"{project}.Application.NgxApp.CompanyTable" in page_shared_refs,
        f"Entry page does not use entity shared tables in {project}",
    )
    print(f"[crud-validate] entry page uses shared components project={project}", flush=True)

    artifact_path = artifact_dir / f"{project}.json"
    artifact_path.write_text(json.dumps(artifact, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(f"[crud-validate] completed project={project} artifact={artifact_path}", flush=True)
    return artifact_path, {
        "project": project,
        "driverFamily": upsert.get("driverFamily"),
        "upsertCrudStatus": upsert.get("status"),
        "crudStatusAfterUpsert": status1.get("status"),
        "upsertNgxCrudKitStatus": ui_result.get("status"),
        "crudStatusFinal": status2.get("status"),
        "ui": status2.get("ui", {}),
    }


def scenario_with_suffix(spec_path, suffix):
    spec = load_spec(spec_path)
    spec["project"] = unique_project(spec["project"] + suffix)
    if spec["database"]["mode"] == "hsqldb":
        spec["database"]["database"] = spec["project"].lower()
    else:
        spec["database"]["database"] = spec["database"]["database"] + "_" + str(int(time.time()))
    return spec


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL)
    parser.add_argument("--artifacts-dir", default=str(ROOT / "tests" / "reports" / "crud-validation" / time.strftime("%Y%m%d_%H%M%S")))
    parser.add_argument("--skip-postgresql", action="store_true")
    parser.add_argument("--skip-mariadb", action="store_true")
    args = parser.parse_args()

    artifact_dir = Path(args.artifacts_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    wait_for_mcp_ready(args.mcp_url, timeout=90)

    results = {"artifacts": [], "scenarios": []}

    hsql_spec = scenario_with_suffix(ROOT / "tests" / "fixtures" / "crud" / "spec_hsqldb.json", "")
    artifact_path, summary = validate_runtime(args.mcp_url, hsql_spec, artifact_dir)
    results["artifacts"].append(str(artifact_path))
    results["scenarios"].append(summary)

    if not args.skip_postgresql:
        pg_spec = scenario_with_suffix(ROOT / "tests" / "fixtures" / "crud" / "spec_postgresql.json", "")
        pg_env = os.environ.copy()
        pg_env.update({
            "COMPOSE_PROJECT_NAME": pg_spec["project"].lower(),
            "POSTGRES_DB": pg_spec["database"]["database"],
            "POSTGRES_USER": pg_spec["database"]["user"],
            "POSTGRES_PASSWORD": pg_spec["database"]["password"],
            "POSTGRES_PORT": str(pg_spec["database"]["port"]),
        })
        pg_compose = ROOT / "tests" / "fixtures" / "crud" / "postgresql" / "docker-compose.yml"
        try:
            docker_up(pg_compose, pg_env)
            artifact_path, summary = validate_runtime(args.mcp_url, pg_spec, artifact_dir)
            results["artifacts"].append(str(artifact_path))
            results["scenarios"].append(summary)
        finally:
            docker_down(pg_compose, pg_env)

    if not args.skip_mariadb:
        maria_spec = scenario_with_suffix(ROOT / "tests" / "fixtures" / "crud" / "spec_mariadb.json", "")
        maria_env = os.environ.copy()
        maria_env.update({
            "COMPOSE_PROJECT_NAME": maria_spec["project"].lower(),
            "MARIADB_DATABASE": maria_spec["database"]["database"],
            "MARIADB_ROOT_PASSWORD": maria_spec["database"]["password"],
            "MARIADB_PORT": str(maria_spec["database"]["port"]),
        })
        maria_compose = ROOT / "tests" / "fixtures" / "crud" / "mariadb" / "docker-compose.yml"
        try:
            docker_up(maria_compose, maria_env)
            artifact_path, summary = validate_runtime(args.mcp_url, maria_spec, artifact_dir)
            results["artifacts"].append(str(artifact_path))
            results["scenarios"].append(summary)
        finally:
            docker_down(maria_compose, maria_env)

    (artifact_dir / "summary.json").write_text(json.dumps(results, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(json.dumps(results, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
