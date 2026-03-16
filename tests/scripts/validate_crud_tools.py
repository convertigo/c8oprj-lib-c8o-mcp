#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path("/Users/nicolas/git/c8oprj-c8o-mcp")
DEFAULT_MCP_URL = "http://localhost:18080/convertigo/api/mcp"
PROTOCOL_VERSION = "2025-06-18"
TEST_PROJECT_PATTERNS = (
    re.compile(r"^CrudSmoke"),
    re.compile(r"^FreshSessionFastpath_"),
    re.compile(r"^Fastpath"),
)


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
                    "method": "initialize",
                    "params": {"protocolVersion": PROTOCOL_VERSION},
                },
                timeout=10,
            )
            if response.get("result", {}).get("serverInfo"):
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


def unique_project(base):
    return f"{base}_{int(time.time())}"


def singularize_name(name):
    text = str(name or "")
    if text.endswith("ies"):
        return text[:-3] + "y"
    if text.endswith("ses"):
        return text[:-2]
    if text.endswith("s") and len(text) > 1:
        return text[:-1]
    return text


def pascalize_name(name):
    parts = re.split(r"[^A-Za-z0-9]+", str(name or ""))
    return "".join(part[:1].upper() + part[1:] for part in parts if part)


def load_spec(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def cleanup_project(url, project):
    try:
        call_tool(url, "project-delete", {"project": project})
    except Exception:
        pass


def expected_ui_globals(variant):
    return [
        "crmBuildStage",
        "crmLoading",
        "crmError",
        "crmStatus",
        "crmCompanies",
        "crmContacts",
        "crmCounts",
        "crmSelectedCompany",
        "crmCompanyContacts",
    ] if variant == "master-detail" else [
        "crudBuildStage",
        "crudLoading",
        "crudError",
        "crudStatus",
        "crudRows",
        "crudCounts",
        "crudSamples",
        "crudSelected",
        "crudDrafts",
        "crudModes",
        "crudEntityStatus",
        "crudEntityErrors",
    ]


def list_projects(url, filter_text):
    return (call_tool(url, "project-list", {"filter": filter_text, "limit": 100}, timeout=60) or {}).get("projects", [])


def list_test_projects(url):
    names = []
    for filter_text in ("CrudSmoke", "FreshSessionFastpath", "Fastpath"):
        for project in list_projects(url, filter_text):
            name = str(project.get("name") or "")
            if name and any(pattern.search(name) for pattern in TEST_PROJECT_PATTERNS) and name not in names:
                names.append(name)
    return names


def purge_test_projects(url, exclude=None):
    exclude = set(exclude or [])
    deleted = []
    for project in list_test_projects(url):
        if project in exclude:
            continue
        cleanup_project(url, project)
        deleted.append(project)
    return deleted


def flatten_tree_names(node, names=None):
    names = names or []
    if isinstance(node, dict):
        name = node.get("name")
        if name:
            names.append(str(name))
        for child in node.get("children") or []:
            flatten_tree_names(child, names)
    return names


def flatten_tree_classnames(node, classnames=None):
    classnames = classnames or []
    if isinstance(node, dict):
        class_name = node.get("className")
        if class_name:
            classnames.append(str(class_name))
        for child in node.get("children") or []:
            flatten_tree_classnames(child, classnames)
    return classnames


def serialize_tree(node):
    return json.dumps(node or {}, ensure_ascii=True, sort_keys=True)


def sql_output_rows(payload):
    if isinstance(payload, dict):
        rows = payload.get("sql_output")
        if isinstance(rows, list):
            return rows
        for key in ("result", "response", "document"):
            nested = payload.get(key)
            if isinstance(nested, dict):
                rows = nested.get("sql_output")
                if isinstance(rows, list):
                    return rows
    return []


def first_row(payload):
    rows = sql_output_rows(payload)
    return rows[0] if rows else {}


def row_value(row, *keys):
    for key in keys:
        if isinstance(row, dict) and key in row and row[key] not in (None, ""):
            return row[key]
    return None


def validate_runtime(url, spec, artifact_dir):
    project = spec["project"]
    connector = spec["database"]["connector"]
    facade_prefix = spec["facade"]["prefix"]
    entry_page = spec["ui"].get("entryPage", "Page")
    variant = spec["ui"].get("variant", "entity-pages")
    entities = spec["entities"]
    entity_names = [entity["name"] for entity in entities]
    requestables = ["init_schema"] + [f"list_{name}" for name in entity_names] + [f"count_{name}" for name in entity_names]
    is_crm = variant == "master-detail" and "contacts" in entity_names and "companies" in entity_names
    if is_crm:
        requestables.append("list_company_contacts")
    artifact = {"project": project, "steps": []}

    print(f"[crud-validate] start project={project} driver={spec['database']['mode']}", flush=True)

    cleanup_project(url, project)
    print(f"[crud-validate] cleanup project={project}", flush=True)

    upsert = call_tool(url, "upsert-crud", {"spec": spec, "sequence": True, "ui": False}, timeout=240)
    artifact["steps"].append({"tool": "upsert-crud", "result": upsert})
    assert_true(upsert.get("status") == "success", f"upsert-crud did not succeed for {project}")
    print(f"[crud-validate] upsert-crud ok project={project}", flush=True)

    backend_proof = call_tool(
        url,
        "crud-proof",
        {
            "project": project,
            "connector": connector,
            "facadePrefix": facade_prefix,
            "profile": spec.get("seed", {}).get("profile", ""),
            "variant": spec["ui"].get("variant", ""),
            "proofRequestables": requestables,
        },
        timeout=180,
    )
    artifact["steps"].append({"tool": "crud-proof-backend", "result": backend_proof})
    assert_true(backend_proof.get("status") == "success", f"crud-proof backend did not succeed for {project}")
    assert_true(not backend_proof.get("missing"), f"crud-proof backend missing targets for {project}")
    assert_true(not backend_proof.get("transactions", {}).get("missing"), f"Missing transactions after upsert for {project}")
    assert_true(not backend_proof.get("sequences", {}).get("missing"), f"Missing sequences after upsert for {project}")
    print(f"[crud-validate] backend crud-proof ok project={project}", flush=True)

    public_requestables = [f"{project}.{facade_prefix}_list_{entity['name']}" for entity in entities]
    list_results = {}
    for requestable in public_requestables:
        public_result = call_tool(url, "requestable-execute", {"requestable": requestable, "variables": "{}"}, timeout=120)
        artifact["steps"].append({"tool": "requestable-execute-public", "requestable": requestable, "result": public_result})
        assert_true("error" not in public_result, f"Public facade requestable failed for {project}: {requestable}")
        list_results[requestable.split(f"{facade_prefix}_list_", 1)[-1]] = public_result
    print(f"[crud-validate] public facade requestables ok project={project}", flush=True)
    if is_crm:
        company_list_result = call_tool(url, "requestable-execute", {"requestable": f"{project}.{facade_prefix}_list_companies", "variables": "{}"}, timeout=120)
        artifact["steps"].append({"tool": "requestable-execute-public", "requestable": f"{project}.{facade_prefix}_list_companies", "result": company_list_result})
        company_row = first_row(company_list_result or {})
        company_id = row_value(company_row, "ID", "id")
        assert_true(company_id is not None, f"Unable to extract a company id for relation proof in {project}")
        relation_result = call_tool(
            url,
            "requestable-execute",
            {
                "requestable": f"{project}.{facade_prefix}_list_company_contacts",
                "variables": {"company_id": str(company_id)},
            },
            timeout=120,
        )
        artifact["steps"].append({"tool": "requestable-execute-public", "requestable": f"{project}.{facade_prefix}_list_company_contacts", "result": relation_result})
        assert_true("error" not in relation_result, f"Public relation facade failed for {project}")
        print(f"[crud-validate] public relation facade ok project={project}", flush=True)

    for entity in entities:
        count_result = call_tool(url, "requestable-execute", {"requestable": f"{project}.{facade_prefix}_count_{entity['name']}", "variables": "{}"}, timeout=120)
        artifact["steps"].append({"tool": "requestable-execute-public", "requestable": f"{project}.{facade_prefix}_count_{entity['name']}", "result": count_result})
        total = row_value(first_row(count_result), "TOTAL", "total")
        assert_true(int(total) == spec["seed"]["rowsPerEntity"], f"Unexpected seed count for {project}.{entity['name']}: {total}")
    print(f"[crud-validate] seed counts ok project={project}", flush=True)

    bootstrap_ui_result = call_tool(
        url,
        "upsert-ngx-crud-kit",
        {
            "project": project,
            "entities": spec["entities"],
            "variant": spec["ui"].get("variant", "entity-pages"),
            "stage": "bootstrap",
            "facadePrefix": facade_prefix,
            "entryPage": entry_page,
        },
        timeout=180,
    )
    artifact["steps"].append({"tool": "upsert-ngx-crud-kit-bootstrap", "result": bootstrap_ui_result})
    assert_true(bootstrap_ui_result.get("status") == "success", f"upsert-ngx-crud-kit bootstrap did not succeed for {project}")
    bootstrap_runtime = bootstrap_ui_result.get("runtimeEvidence") or {}
    assert_true(int(bootstrap_runtime.get("sharedActionsRequested") or 0) > 0, f"Bootstrap UI did not create shared actions for {project}")
    assert_true((bootstrap_runtime.get("uiGlobals") or []) == expected_ui_globals(variant), f"Unexpected UI globals for {project}: {bootstrap_runtime.get('uiGlobals')}")
    bootstrap_refs = set((bootstrap_ui_result.get("runtimeEvidence") or {}).get("pageSharedRefs") or [])
    assert_true(f"{project}.Application.NgxApp.WorkInProgressCard" in bootstrap_refs, f"Bootstrap shell did not include WorkInProgressCard in {project}")
    print(f"[crud-validate] bootstrap ngx crud kit ok project={project}", flush=True)

    mobile_builder = call_tool(url, "mobile-builder-open", {"project": project, "timeoutSec": 120, "logsLimit": 60}, timeout=180)
    artifact["steps"].append({"tool": "mobile-builder-open", "result": mobile_builder})
    assert_true(mobile_builder.get("ready") is True, f"Mobile builder did not become ready for {project}")
    viewer_base_url = str(mobile_builder.get("viewerBaseUrl") or mobile_builder.get("baseUrl") or "")
    viewer_home_url = str(mobile_builder.get("viewerHomeUrl") or "")
    viewer_url = str(mobile_builder.get("viewerUrl") or viewer_home_url or viewer_base_url or "")
    assert_true(bool(viewer_base_url), f"Mobile builder did not expose viewerBaseUrl for {project}")
    assert_true(bool(viewer_home_url), f"Mobile builder did not expose viewerHomeUrl for {project}")
    assert_true(bool(viewer_url), f"Mobile builder did not expose a viewer URL for {project}")
    print(f"[crud-validate] mobile builder ready project={project}", flush=True)

    final_ui_result = call_tool(
        url,
        "upsert-ngx-crud-kit",
        {
            "project": project,
            "entities": spec["entities"],
            "variant": spec["ui"].get("variant", "entity-pages"),
            "stage": "final",
            "facadePrefix": facade_prefix,
            "entryPage": entry_page,
        },
        timeout=180,
    )
    artifact["steps"].append({"tool": "upsert-ngx-crud-kit-final", "result": final_ui_result})
    assert_true(final_ui_result.get("status") == "success", f"upsert-ngx-crud-kit final did not succeed for {project}")
    final_runtime = final_ui_result.get("runtimeEvidence") or {}
    assert_true(int(final_runtime.get("sharedActionsRequested") or 0) > 0, f"Final UI did not keep shared actions for {project}")
    assert_true((final_runtime.get("uiGlobals") or []) == expected_ui_globals(variant), f"Unexpected final UI globals for {project}: {final_runtime.get('uiGlobals')}")
    if variant == "entity-pages":
        expected_page_names = [entry_page] + [f"{pascalize_name(entity['name'])}Page" for entity in entities]
        expected_page_routes = ["/home"] + [f"/{entity['name'].lower()}" for entity in entities]
        assert_true((final_runtime.get("pageNames") or []) == expected_page_names, f"Unexpected pageNames for {project}: {final_runtime.get('pageNames')}")
        assert_true((final_runtime.get("pageRoutes") or []) == expected_page_routes, f"Unexpected pageRoutes for {project}: {final_runtime.get('pageRoutes')}")
        entity_pages = final_runtime.get("entityPages") or []
        assert_true(len(entity_pages) == len(entities), f"Unexpected entityPages count for {project}: {len(entity_pages)}")
    final_refs = set((final_ui_result.get("runtimeEvidence") or {}).get("pageSharedRefs") or [])
    assert_true(f"{project}.Application.NgxApp.WorkInProgressCard" not in final_refs, f"Final shell still exposes WorkInProgressCard in {project}")
    mobile_builder_final = call_tool(url, "mobile-builder-open", {"project": project, "timeoutSec": 120, "logsLimit": 60, "forceRestart": True}, timeout=180)
    artifact["steps"].append({"tool": "mobile-builder-open-final", "result": mobile_builder_final})
    assert_true(mobile_builder_final.get("ready") is True, f"Final mobile builder refresh did not become ready for {project}")
    assert_true(bool(mobile_builder_final.get("viewerBaseUrl") or mobile_builder_final.get("baseUrl")), f"Final mobile builder refresh did not expose viewerBaseUrl for {project}")
    assert_true(bool(mobile_builder_final.get("viewerHomeUrl")), f"Final mobile builder refresh did not expose viewerHomeUrl for {project}")
    viewer_url = str(mobile_builder_final.get("viewerUrl") or mobile_builder_final.get("viewerHomeUrl") or mobile_builder_final.get("viewerBaseUrl") or viewer_url)
    print(f"[crud-validate] final ngx crud kit ok project={project}", flush=True)

    final_proof = None
    for attempt in range(3):
        final_proof = call_tool(
            url,
            "crud-proof",
            {
                "project": project,
                "connector": connector,
                "facadePrefix": facade_prefix,
                "entryPage": entry_page,
                "profile": spec.get("seed", {}).get("profile", ""),
                "variant": spec["ui"].get("variant", ""),
                "expectUiShell": True,
                "viewerUrl": viewer_url,
                "proofRequestables": requestables,
            },
            timeout=180,
        )
        if final_proof.get("status") == "success":
            break
        time.sleep(3)
    artifact["steps"].append({"tool": "crud-proof-final", "result": final_proof})
    assert_true(final_proof.get("status") == "success", f"crud-proof final did not succeed for {project}")
    assert_true(not final_proof.get("missing"), f"crud-proof final missing targets for {project}")
    ui = final_proof.get("ui", {})
    assert_true(ui.get("starterDominant") is False, f"Starter still dominant for {project}")
    assert_true(ui.get("visibleShellPresent") is True, f"Visible shell missing for {project}")
    assert_true(ui.get("liveBindingPresent") is True, f"Live UI bindings missing for {project}")
    assert_true(ui.get("statefulActionsPresent") is True, f"Shared UI actions missing for {project}")
    assert_true(ui.get("pageBootstrapPresent") is True, f"Entry page bootstrap missing for {project}")
    viewer_probe = ui.get("viewerProbe") or {}
    assert_true(viewer_probe.get("ok") is True, f"Viewer probe failed for {project}: {viewer_probe.get('message')}")
    if is_crm:
        assert_true((final_proof.get("crm") or {}).get("enabled") is True, f"CRM proof metadata missing for {project}")
    print(f"[crud-validate] final crud-proof ui ok project={project}", flush=True)

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
        "CrudPageHeader",
        "CrudLoadingState",
        "CrudErrorRetryState",
    }
    if is_crm:
        expected_components.update({
            "ContactTable",
            "ContactCard",
            "CompanyTable",
            "CompanyCard",
            "crm_bootstrap_dashboard",
            "crm_refresh_companies",
            "crm_refresh_contacts",
            "crm_select_company",
            "crm_refresh_company_contacts",
            "crm_retry_dashboard",
        })
    else:
        expected_components.update({"DashboardStatCard", "crud_bootstrap_dashboard", "crud_retry_dashboard"})
        for entity in entities:
            singular = pascalize_name(singularize_name(entity["name"]))
            plural = pascalize_name(entity["name"])
            expected_components.update({
                f"{plural}ListPanel",
                f"{plural}DetailCard",
                f"{plural}EditForm",
                f"crud_refresh_{entity['name']}",
                f"crud_open_{entity['name']}_page",
                f"crud_bootstrap_{entity['name']}_page",
                f"crud_select_{singularize_name(entity['name'])}",
                f"crud_new_{singularize_name(entity['name'])}",
                f"crud_save_{singularize_name(entity['name'])}",
                f"crud_delete_{singularize_name(entity['name'])}",
                f"crud_cancel_{singularize_name(entity['name'])}",
            })
    missing_components = sorted(expected_components - app_names)
    assert_true(not missing_components, f"Missing shared CRUD components for {project}: {', '.join(missing_components)}")
    print(f"[crud-validate] shared components present project={project}", flush=True)

    page_shared_refs = final_refs
    assert_true(
        f"{project}.Application.NgxApp.CrudPageHeader" in page_shared_refs,
        f"Entry page does not use CrudPageHeader in {project}",
    )
    if not is_crm and variant == "entity-pages":
        assert_true(
            f"{project}.Application.NgxApp.DashboardStatCard" in page_shared_refs,
            f"Entry page does not use DashboardStatCard in {project}",
        )
        for entity_page in final_runtime.get("entityPages") or []:
            entity_name = str(entity_page.get("entity") or "")
            shared_refs = set(entity_page.get("sharedRefs") or [])
            plural = pascalize_name(entity_name)
            assert_true(
                f"{project}.Application.NgxApp.CrudPageHeader" in shared_refs,
                f"{entity_name} page does not use CrudPageHeader in {project}",
            )
            assert_true(
                f"{project}.Application.NgxApp.{plural}ListPanel" in shared_refs,
                f"{entity_name} page does not use {plural}ListPanel in {project}",
            )
            assert_true(
                f"{project}.Application.NgxApp.{plural}DetailCard" in shared_refs,
                f"{entity_name} page does not use {plural}DetailCard in {project}",
            )
            assert_true(
                f"{project}.Application.NgxApp.{plural}EditForm" in shared_refs,
                f"{entity_name} page does not use {plural}EditForm in {project}",
            )
            assert_true(
                f"{project}.Application.NgxApp.CrudLoadingState" in shared_refs and
                f"{project}.Application.NgxApp.CrudErrorRetryState" in shared_refs,
                f"{entity_name} page does not use shared state components in {project}",
            )
    elif is_crm:
        for entity in entities:
            singular = singularize_name(entity["name"]).capitalize()
            assert_true(
                f"{project}.Application.NgxApp.{singular}Table" in page_shared_refs,
                f"Entry page does not use {singular}Table in {project}",
            )
            assert_true(
                f"{project}.Application.NgxApp.{singular}Card" in page_shared_refs,
                f"Entry page does not use {singular}Card in {project}",
            )
    else:
        for entity in entities:
            plural = pascalize_name(entity["name"])
            assert_true(
                f"{project}.Application.NgxApp.{plural}ListPanel" in page_shared_refs,
                f"Entry page does not use {plural}ListPanel in {project}",
            )
            assert_true(
                f"{project}.Application.NgxApp.{plural}DetailCard" in page_shared_refs,
                f"Entry page does not use {plural}DetailCard in {project}",
            )
            assert_true(
                f"{project}.Application.NgxApp.{plural}EditForm" in page_shared_refs,
                f"Entry page does not use {plural}EditForm in {project}",
            )
    assert_true(
        f"{project}.Application.NgxApp.CrudLoadingState" in page_shared_refs and
        f"{project}.Application.NgxApp.CrudErrorRetryState" in page_shared_refs,
        f"Entry page does not use state shared components in {project}",
    )
    print(f"[crud-validate] entry page uses shared components project={project}", flush=True)

    page_tree = call_tool(
        url,
        "databaseobject-tree-get",
        {
            "target": f"{project}.Application.NgxApp.Page",
            "childrenDepth": 2,
            "properties": "changed",
            "limit": 120,
        },
        timeout=120,
    )
    artifact["steps"].append({"tool": "databaseobject-tree-get", "target": f"{project}.Application.NgxApp.Page", "result": page_tree})
    page_names = set(flatten_tree_names(page_tree.get("tree")))
    assert_true("PageEvent" in page_names, f"Entry page bootstrap event missing in {project}")
    assert_true("InvokeBootstrapDashboard" in page_names, f"Entry page does not invoke the bootstrap dashboard action in {project}")
    print(f"[crud-validate] entry page runtime bootstrap present project={project}", flush=True)

    artifact_path = artifact_dir / f"{project}.json"
    artifact_path.write_text(json.dumps(artifact, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(f"[crud-validate] completed project={project} artifact={artifact_path}", flush=True)
    return artifact_path, {
        "project": project,
        "driverFamily": upsert.get("driverFamily"),
        "upsertCrudStatus": upsert.get("status"),
        "crudProofBackendStatus": backend_proof.get("status"),
        "upsertNgxCrudKitBootstrapStatus": bootstrap_ui_result.get("status"),
        "upsertNgxCrudKitFinalStatus": final_ui_result.get("status"),
        "crudProofFinalStatus": final_proof.get("status"),
        "ui": final_proof.get("ui", {}),
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
    deleted_projects = purge_test_projects(args.mcp_url)

    results = {"artifacts": [], "scenarios": [], "deletedProjects": deleted_projects}

    poll_spec = scenario_with_suffix(ROOT / "tests" / "fixtures" / "crud" / "spec_poll_hsqldb.json", "")
    artifact_path, summary = validate_runtime(args.mcp_url, poll_spec, artifact_dir)
    results["artifacts"].append(str(artifact_path))
    results["scenarios"].append(summary)

    crm_hsql_spec = scenario_with_suffix(ROOT / "tests" / "fixtures" / "crud" / "spec_hsqldb.json", "")
    artifact_path, summary = validate_runtime(args.mcp_url, crm_hsql_spec, artifact_dir)
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
