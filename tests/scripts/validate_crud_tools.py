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

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MCP_URL = os.environ.get("CONVERTIGO_MCP_URL", "http://localhost:18080/convertigo/api/mcp")
PROTOCOL_VERSION = "2025-06-18"
DEFAULT_RUNTIME_BASE = Path(os.environ.get("CONVERTIGO_RUNTIME_BASE", str(Path.home() / "dev" / "convertigo")))
RUNTIME_BASE = DEFAULT_RUNTIME_BASE
TEST_PROJECT_PATTERNS = (
    re.compile(r"^CrudSmoke"),
    re.compile(r"^EmployeesCompanies"),
    re.compile(r"^GroupOutingsPoll"),
    re.compile(r"^ScoresJeux"),
    re.compile(r"^PokemonCatalog"),
    re.compile(r"^FreshSessionFastpath_"),
    re.compile(r"^Fastpath"),
)


def call_mcp(url, payload, timeout=60):
    headers = {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": PROTOCOL_VERSION,
    }
    token = os.environ.get("CONVERTIGO_MCP_TOKEN", "").strip()
    if token:
        headers["Authorization"] = "Bearer " + token
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
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


def pluralize_name(name):
    text = normalized_name(name)
    if not text:
        return text
    if text.endswith("ies"):
        return text
    if text.endswith("y") and len(text) > 1 and text[-2] not in "aeiou":
        return text[:-1] + "ies"
    if text.endswith("s"):
        return text
    return text + "s"


def load_spec(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def cleanup_project(url, project):
    try:
        call_tool(url, "project-delete", {"project": project})
    except Exception:
        pass


def find_runtime_project_dir(project):
    candidates = []
    if RUNTIME_BASE.exists():
        for runtime_dir in sorted(RUNTIME_BASE.glob("runtime-*")):
            candidate = runtime_dir / project
            if candidate.exists():
                candidates.append(candidate)
    if not candidates:
        raise RuntimeError(f"Unable to locate runtime project directory for {project}")
    candidates.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    return candidates[0]


def read_runtime_text(project, relative_path):
    runtime_dir = find_runtime_project_dir(project)
    path = runtime_dir / relative_path
    assert_true(path.exists(), f"Missing runtime file for {project}: {path}")
    return path.read_text(encoding="utf-8"), path


def list_projects(url, filter_text):
    return (call_tool(url, "project-list", {"filter": filter_text, "limit": 100}, timeout=60) or {}).get("projects", [])


def project_exists(url, project_name):
    for project in list_projects(url, project_name):
        if str(project.get("name") or "") == project_name:
            return True
    return False


def list_test_projects(url):
    names = []
    for filter_text in ("CrudSmoke", "EmployeesCompanies", "GroupOutingsPoll", "ScoresJeux", "PokemonCatalog", "FreshSessionFastpath", "Fastpath"):
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


def sql_output_rows(payload):
    if isinstance(payload, dict):
        rows = payload.get("rows")
        if isinstance(rows, list):
            return rows
        row = payload.get("row")
        if isinstance(row, dict):
            return [row]
        for key in ("result", "response", "document"):
            nested = payload.get(key)
            if isinstance(nested, dict):
                rows = nested.get("rows")
                if isinstance(rows, list):
                    return rows
                row = nested.get("row")
                if isinstance(row, dict):
                    return [row]
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


def row_has_key(row, key):
    if not isinstance(row, dict):
        return False
    candidates = {str(key or ""), str(key or "").upper(), str(key or "").lower()}
    return any(candidate in row for candidate in candidates if candidate)


def normalized_name(value):
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")


def explicit_seed_rows(spec, entity):
    data = ((spec.get("seed") or {}).get("data") or {})
    rows = data.get(entity_name(entity))
    return rows if isinstance(rows, list) else []


def expected_seed_count(spec, entity):
    explicit_rows = explicit_seed_rows(spec, entity)
    if explicit_rows is not None and entity_name(entity) in (((spec.get("seed") or {}).get("data") or {})):
        return len(explicit_rows)
    return int((spec.get("seed") or {}).get("rowsPerEntity") or 0)


def validate_explicit_seed_rows(list_payload, entity, spec):
    rows = sql_output_rows(list_payload or {})
    expected_rows = explicit_seed_rows(spec, entity)
    if not expected_rows:
        return
    fields = entity.get("fields") or []
    primary_columns = {normalized_name(field.get("column") or field.get("name")) for field in fields if field.get("primary")}
    relation_columns = {normalized_name(field.get("column") or field.get("name")) for field in fields if field.get("references")}
    for expected in expected_rows:
        comparable = {}
        for raw_key, raw_value in (expected or {}).items():
            normalized_key = normalized_name(raw_key)
            if normalized_key in primary_columns or normalized_key in relation_columns:
                continue
            comparable[normalized_key] = str(raw_value)
        if not comparable:
            continue
        matches = False
        for row in rows:
            if all(str(row_value(row, key, key.upper(), key.lower())) == value for key, value in comparable.items()):
                matches = True
                break
        assert_true(matches, f"Explicit seed row not found in list_{entity_name(entity)} output: {expected}")


def entity_name(entity):
    return str(entity.get("plural") or entity.get("name") or "")


def entity_singular(entity):
    return str(entity.get("singular") or singularize_name(entity_name(entity)))


def generated_entity_name(entity):
    return normalized_name(entity.get("plural") or pluralize_name(entity.get("name") or entity_name(entity)))


def find_entity(spec, name):
    target = normalized_name(name)
    for entity in spec.get("entities") or []:
        candidates = {
            normalized_name(entity_name(entity)),
            normalized_name(entity.get("name") or ""),
            normalized_name(entity.get("singular") or ""),
            generated_entity_name(entity),
        }
        if target in {candidate for candidate in candidates if candidate}:
            return entity
    return None


def primary_field(entity):
    for field in entity.get("fields") or []:
        if field.get("primary"):
            return field
    return (entity.get("fields") or [{}])[0]


def primary_column(entity):
    field = primary_field(entity)
    return normalized_name(field.get("column") or field.get("name") or "id")


def relation_label_alias(relation):
    return f"{normalized_name(relation.get('fromField') or '')}__label"


def relation_requestable_name(relation, relations=None):
    suffix = str(relation["toSingular"])
    duplicates = 0
    for current in relations or []:
        if normalized_name(current.get("fromEntity")) != normalized_name(relation.get("fromEntity")):
            continue
        if normalized_name(current.get("toEntity")) != normalized_name(relation.get("toEntity")):
            continue
        duplicates += 1
    if duplicates > 1:
        from_field = normalized_name(relation.get("fromField") or "")
        from_field = re.sub(r"_id$", "", from_field)
        if from_field:
            suffix = from_field
    return f"list_{relation['fromEntity']}_by_{suffix}"


def extract_relations(spec):
    relations = []
    seen = set()
    for raw in spec.get("relations") or []:
        if not isinstance(raw, dict):
            continue
        relation_type = str(raw.get("type") or "many-to-one").strip().lower()
        if relation_type not in ("many-to-one", "one-to-many"):
            continue
        if relation_type == "one-to-many":
            from_entity = generated_entity_name(find_entity(spec, raw.get("toEntity")) or {"name": raw.get("toEntity")})
            from_field = normalized_name(raw.get("toField") or "id")
            to_entity = generated_entity_name(find_entity(spec, raw.get("fromEntity")) or {"name": raw.get("fromEntity")})
            to_field = normalized_name(raw.get("fromField") or "id")
        else:
            from_entity = generated_entity_name(find_entity(spec, raw.get("fromEntity")) or {"name": raw.get("fromEntity")})
            from_field = normalized_name(raw.get("fromField"))
            to_entity = generated_entity_name(find_entity(spec, raw.get("toEntity")) or {"name": raw.get("toEntity")})
            to_field = normalized_name(raw.get("toField") or "id")
        if not from_entity or not from_field or not to_entity or not to_field:
            continue
        key = (from_entity, from_field, to_entity, to_field)
        if key in seen:
            continue
        seen.add(key)
        relations.append(
            {
                "name": str(raw.get("name") or f"{from_entity}_{to_entity}"),
                "type": "many-to-one",
                "fromEntity": from_entity,
                "fromField": from_field,
                "toEntity": to_entity,
                "toField": to_field,
                "toSingular": singularize_name(to_entity),
                "labelAlias": relation_label_alias({"fromField": from_field}),
            }
        )
    for entity in spec.get("entities") or []:
        current_entity_name = generated_entity_name(entity)
        for field in entity.get("fields") or []:
            references = field.get("references") or {}
            target_entity = generated_entity_name(find_entity(spec, references.get("entity")) or {"name": references.get("entity")})
            target_field = normalized_name(references.get("field") or "id")
            from_field = normalized_name(field.get("column") or field.get("name"))
            if not current_entity_name or not target_entity or not from_field:
                continue
            key = (current_entity_name, from_field, target_entity, target_field)
            if key in seen:
                continue
            seen.add(key)
            relations.append(
                {
                    "name": f"{current_entity_name}_{target_entity}",
                    "type": "many-to-one",
                    "fromEntity": current_entity_name,
                    "fromField": from_field,
                    "toEntity": target_entity,
                    "toField": target_field,
                    "toSingular": singularize_name(target_entity),
                    "labelAlias": relation_label_alias({"fromField": from_field}),
                }
            )
    return relations


def tx_requestable_name(entity, verb):
    return f"{verb}_{generated_entity_name(entity)}" if verb in ("list", "count") else f"{verb}_{entity_singular(entity)}"


def validate_backend_generation(url, spec, artifact):
    project = spec["project"]
    connector = spec["database"]["connector"]
    facade_prefix = spec["facade"]["prefix"]
    entities = spec["entities"]
    first_entity = entities[0]
    first_entity_plural = entity_name(first_entity)
    first_entity_singular = entity_singular(first_entity)

    appdb_text, appdb_path = read_runtime_text(project, Path("_c8oProject") / "connectors" / f"{connector}.yaml")
    artifact["steps"].append({"tool": "runtime-file", "path": str(appdb_path)})
    assert_true("Deterministic CRUD" not in appdb_text, f"Backend connector YAML still contains deterministic boilerplate comments in {appdb_path}")
    assert_true("↑default: true" in appdb_text, f"Connector {connector} is not marked default in {appdb_path}")
    default_tx_pattern = re.compile(
        rf"↓{re.escape('list_' + first_entity_plural)} \[transactions\.SqlTransaction\]:\s*\n(?:  .*\n)*?  ↑default: true\b",
        re.MULTILINE,
    )
    assert_true(default_tx_pattern.search(appdb_text) is not None, f"Default transaction not set to list_{first_entity_plural} in {appdb_path}")
    assert_true("BeginTransaction" not in appdb_text and "CommitTransaction" not in appdb_text and "RollbackTransaction" not in appdb_text, f"Obsolete transaction control requestables still present in {appdb_path}")
    assert_true(not (find_runtime_project_dir(project) / "_c8oProject" / "connectors" / "void.yaml").exists(), f"Placeholder void connector still present for {project}")

    init_tree = call_tool(
        url,
        "databaseobject-tree-get",
        {
            "target": f"{project}.cn:{connector}.tr:init_schema",
            "childrenDepth": 0,
            "properties": "all",
            "limit": 20,
        },
        timeout=120,
    )
    artifact["steps"].append({"tool": "databaseobject-tree-get", "target": f"{project}.cn:{connector}.tr:init_schema", "result": init_tree})
    init_props = ((init_tree or {}).get("tree") or {}).get("properties") or {}
    assert_true(int(init_props.get("autoCommit") or -1) == 1, f"init_schema is not AUTOCOMMIT_EACH for {project}: {init_props}")

    create_sequence_name = f"{facade_prefix}_create_{first_entity_singular}"
    sequence_tree = call_tool(
        url,
        "databaseobject-tree-get",
        {
            "target": f"{project}.sq:{create_sequence_name}",
            "childrenDepth": 3,
            "properties": "changed",
            "limit": 200,
        },
        timeout=120,
    )
    artifact["steps"].append({"tool": "databaseobject-tree-get", "target": f"{project}.sq:{create_sequence_name}", "result": sequence_tree})
    sequence_node = (sequence_tree or {}).get("tree") or {}
    assert_true("Deterministic CRUD" not in json.dumps(sequence_node, ensure_ascii=True), f"Sequence {create_sequence_name} still contains deterministic boilerplate comments for {project}")
    sequence_props = sequence_node.get("properties") or {}
    assert_true(str(sequence_props.get("accessibility") or "") == "Hidden", f"CRUD facade sequence must stay hidden for {project}.sq:{create_sequence_name}")
    assert_true(sequence_props.get("authenticatedContextRequired") is True, f"CRUD facade sequence must require an authenticated context for {project}.sq:{create_sequence_name}")
    tx_step = next((child for child in sequence_node.get("children") or [] if child.get("className") == "steps.TransactionStep"), None)
    message_step = next((child for child in sequence_node.get("children") or [] if child.get("className") == "steps.JsonFieldStep" and child.get("name") == "Message"), None)
    assert_true(tx_step is not None and message_step is not None, f"Missing canonical mutation facade steps in {project}.sq:{create_sequence_name}")

    tx_step_all = call_tool(
        url,
        "databaseobject-tree-get",
        {
            "target": tx_step["qname"],
            "childrenDepth": 1,
            "properties": "all",
            "limit": 80,
        },
        timeout=120,
    )
    message_step_all = call_tool(
        url,
        "databaseobject-tree-get",
        {
            "target": message_step["qname"],
            "childrenDepth": 0,
            "properties": "all",
            "limit": 20,
        },
        timeout=120,
    )
    artifact["steps"].append({"tool": "databaseobject-tree-get", "target": tx_step["qname"], "result": tx_step_all})
    artifact["steps"].append({"tool": "databaseobject-tree-get", "target": message_step["qname"], "result": message_step_all})
    assert_true((((tx_step_all or {}).get("tree") or {}).get("properties") or {}).get("output") is False, f"TransactionStep must stay output=false for {project}.sq:{create_sequence_name}")
    message_props = (((message_step_all or {}).get("tree") or {}).get("properties") or {})
    message_key = message_props.get("key")
    if isinstance(message_key, dict):
        message_key = message_key.get("expression") or message_key.get("value")
    assert_true(str(message_key or "") == "message", f"Mutation facade payload key must stay canonical for {project}.sq:{create_sequence_name}: {message_props}")

    variable_nodes = [child for child in sequence_node.get("children") or [] if child.get("className") == "variables.RequestableVariable"]
    assert_true(bool(variable_nodes), f"Sequence {create_sequence_name} does not expose request variables in {project}")
    for variable in variable_nodes:
        props = variable.get("properties") or {}
        assert_true(str(props.get("comment") or "").strip() != "", f"Missing sequence variable comment for {project}: {variable.get('qname')}")
        assert_true(str(props.get("description") or "").strip() != "", f"Missing sequence variable description for {project}: {variable.get('qname')}")
        assert_true("Deterministic CRUD" not in str(props.get("comment") or ""), f"Boilerplate sequence variable comment still present for {project}: {variable.get('qname')}")
    for variable in (tx_step.get("children") or []):
        props = variable.get("properties") or {}
        assert_true(str(props.get("comment") or "").strip() != "", f"Missing step variable comment for {project}: {variable.get('qname')}")
        assert_true(str(props.get("description") or "").strip() != "", f"Missing step variable description for {project}: {variable.get('qname')}")

    login_tree = call_tool(
        url,
        "databaseobject-tree-get",
        {
            "target": f"{project}.sq:auth_login",
            "childrenDepth": 2,
            "properties": "all",
            "limit": 120,
        },
        timeout=120,
    )
    logout_tree = call_tool(
        url,
        "databaseobject-tree-get",
        {
            "target": f"{project}.sq:auth_logout",
            "childrenDepth": 2,
            "properties": "all",
            "limit": 120,
        },
        timeout=120,
    )
    artifact["steps"].append({"tool": "databaseobject-tree-get", "target": f"{project}.sq:auth_login", "result": login_tree})
    artifact["steps"].append({"tool": "databaseobject-tree-get", "target": f"{project}.sq:auth_logout", "result": logout_tree})
    login_node = (login_tree or {}).get("tree") or {}
    logout_node = (logout_tree or {}).get("tree") or {}
    login_props = login_node.get("properties") or {}
    logout_props = logout_node.get("properties") or {}
    assert_true(str(login_props.get("accessibility") or "") == "Hidden", f"auth_login must stay hidden for {project}")
    assert_true(login_props.get("authenticatedContextRequired") is False, f"auth_login must not require an authenticated context for {project}")
    assert_true(str(logout_props.get("accessibility") or "") == "Hidden", f"auth_logout must stay hidden for {project}")
    assert_true(logout_props.get("authenticatedContextRequired") is False, f"auth_logout must not require an authenticated context for {project}")
    login_var_names = sorted(child.get("name") for child in (login_node.get("children") or []) if child.get("className") == "variables.RequestableVariable")
    assert_true(login_var_names == ["password", "username"], f"auth_login must expose username/password for {project}: {login_var_names}")
    logout_step_names = [child.get("name") for child in (logout_node.get("children") or [])]
    assert_true("RemoveAuthenticatedUser" in logout_step_names, f"auth_logout must remove the authenticated user for {project}")

    list_schema = call_tool(
        url,
        "databaseobject-schema",
        {
            "qname": f"{project}.cn:{connector}.tr:{tx_requestable_name(first_entity, 'list')}",
            "type": "xml",
        },
        timeout=120,
    )
    create_schema = call_tool(
        url,
        "databaseobject-schema",
        {
            "qname": f"{project}.cn:{connector}.tr:{tx_requestable_name(first_entity, 'create')}",
            "type": "xml",
        },
        timeout=120,
    )
    artifact["steps"].append({"tool": "databaseobject-schema", "qname": f"{project}.cn:{connector}.tr:{tx_requestable_name(first_entity, 'list')}", "result": list_schema})
    artifact["steps"].append({"tool": "databaseobject-schema", "qname": f"{project}.cn:{connector}.tr:{tx_requestable_name(first_entity, 'create')}", "result": create_schema})
    assert_true("<sql_output" in str((list_schema or {}).get("response") or ""), f"List transaction schema was not learned for {project}")
    assert_true("<sql_output" in str((create_schema or {}).get("response") or ""), f"Create transaction schema was not learned for {project}")

    relations = extract_relations(spec)
    if relations:
        relation = relations[0]
        child_entity = find_entity(spec, relation["fromEntity"])
        relation_schema = call_tool(
            url,
            "databaseobject-schema",
            {
                "qname": f"{project}.cn:{connector}.tr:{tx_requestable_name(child_entity, 'list')}",
                "type": "xml",
            },
            timeout=120,
        )
        artifact["steps"].append({"tool": "databaseobject-schema", "qname": f"{project}.cn:{connector}.tr:{tx_requestable_name(child_entity, 'list')}", "result": relation_schema})
        assert_true(relation["labelAlias"].upper() in str((relation_schema or {}).get("response") or "").upper(), f"Relation label alias schema missing for {project}: {relation['labelAlias']}")


def validate_runtime(url, spec, artifact_dir):
    project = spec["project"]
    connector = spec["database"]["connector"]
    facade_prefix = spec["facade"]["prefix"]
    entities = spec["entities"]
    relations = extract_relations(spec)
    entity_names = [entity["name"] for entity in entities]
    requestables = ["init_schema"] + [f"list_{name}" for name in entity_names] + [f"count_{name}" for name in entity_names]
    is_crm = "contacts" in entity_names and "companies" in entity_names
    if is_crm:
        requestables.append("list_company_contacts")
    artifact = {"project": project, "steps": []}

    print(f"[crud-validate] start project={project} driver={spec['database']['mode']}", flush=True)

    cleanup_project(url, project)
    print(f"[crud-validate] cleanup project={project}", flush=True)

    starter_import = call_tool(
        url,
        "marketplace-import",
        {
            "project": "template_ngxBuilderIonic",
            "importedProjectName": project,
        },
        timeout=180,
    )
    artifact["steps"].append({"tool": "marketplace-import", "result": starter_import})
    assert_true(project_exists(url, project), f"marketplace-import did not load {project}")
    print(f"[crud-validate] marketplace-import ok project={project}", flush=True)

    mobile_builder_starter = call_tool(url, "mobile-builder-open", {"project": project, "timeoutSec": 15, "logsLimit": 60}, timeout=45)
    artifact["steps"].append({"tool": "mobile-builder-open-starter", "result": mobile_builder_starter})
    assert_true(mobile_builder_starter.get("status") in ("ready", "building"), f"Starter mobile builder did not become useful for {project}: {mobile_builder_starter.get('message')}")
    assert_true(not (mobile_builder_starter.get("compileErrors") or []), f"Starter mobile builder returned compile errors for {project}")
    assert_true(mobile_builder_starter.get("editorOpened") is True, f"Starter mobile builder did not open the editor for {project}")
    print(f"[crud-validate] starter mobile builder status={mobile_builder_starter.get('status')} project={project}", flush=True)

    upsert = call_tool(url, "upsert-crud", {"spec": spec, "sequence": True}, timeout=240)
    artifact["steps"].append({"tool": "upsert-crud", "result": upsert})
    assert_true(upsert.get("status") == "success", f"upsert-crud did not succeed for {project}")
    if isinstance(upsert.get("createdCount"), (int, float)):
        assert_true(int(upsert.get("createdCount") or 0) >= len(upsert.get("created") or []), f"createdCount is inconsistent for {project}: {upsert.get('createdCount')} < {len(upsert.get('created') or [])}")
    if isinstance(upsert.get("updatedCount"), (int, float)):
        assert_true(int(upsert.get("updatedCount") or 0) >= len(upsert.get("updated") or []), f"updatedCount is inconsistent for {project}: {upsert.get('updatedCount')} < {len(upsert.get('updated') or [])}")
    runtime_relations = ((upsert.get("runtimeEvidence") or {}).get("relations") or [])
    if relations:
        assert_true(len(runtime_relations) >= len(relations), f"upsert-crud did not report runtime relations for {project}: {runtime_relations}")
    print(f"[crud-validate] upsert-crud ok project={project}", flush=True)

    backend_proof = call_tool(
        url,
        "crud-proof",
        {
            "project": project,
            "connector": connector,
            "facadePrefix": facade_prefix,
            "profile": spec.get("seed", {}).get("profile", ""),
            "proofRequestables": requestables,
        },
        timeout=180,
    )
    artifact["steps"].append({"tool": "crud-proof-backend", "result": backend_proof})
    assert_true(backend_proof.get("status") == "success", f"crud-proof backend did not succeed for {project}")
    assert_true(not backend_proof.get("missing"), f"crud-proof backend missing targets for {project}")
    assert_true(not backend_proof.get("transactions", {}).get("missing"), f"Missing transactions after upsert for {project}")
    assert_true(not backend_proof.get("sequences", {}).get("missing"), f"Missing sequences after upsert for {project}")
    backend_checks = {}
    for item in backend_proof.get("checks") or []:
        if isinstance(item, dict) and (item.get("id") or item.get("name")):
            backend_checks[item.get("id") or item.get("name")] = item
    assert_true((backend_checks.get("facade-hidden-authenticated") or {}).get("ok") is True, f"facade-hidden-authenticated proof failed for {project}")
    assert_true((backend_checks.get("auth-sequences") or {}).get("ok") is True, f"auth-sequences proof failed for {project}")
    if is_crm:
        assert_true((backend_proof.get("crm") or {}).get("enabled") is True, f"CRM proof metadata missing for {project}")
    if relations and not is_crm:
        checks = {}
        for item in backend_proof.get("checks") or []:
            if isinstance(item, dict) and (item.get("id") or item.get("name")):
                checks[item.get("id") or item.get("name")] = item
        for relation in relations:
            relation_qname = f"{project}.{facade_prefix}_{relation_requestable_name(relation, relations)}"
            relation_check = checks.get(f"relation:{normalized_name(relation_qname)}")
            relation_label_check = checks.get(f"relation-label:{normalized_name(relation_qname)}")
            assert_true(relation_check is not None and relation_check.get("ok") is True, f"crud-proof relation check missing or failing for {project}: {relation_qname}")
            assert_true(relation_label_check is not None and relation_label_check.get("ok") is True, f"crud-proof relation label check missing or failing for {project}: {relation_qname}")
    print(f"[crud-validate] backend crud-proof ok project={project}", flush=True)
    validate_backend_generation(url, spec, artifact)
    print(f"[crud-validate] backend generation conventions ok project={project}", flush=True)

    list_requestables = [f"{project}.{connector}.list_{generated_entity_name(entity)}" for entity in entities]
    list_results = {}
    for requestable in list_requestables:
        list_result = call_tool(url, "requestable-execute", {"requestable": requestable, "variables": "{}"}, timeout=120)
        artifact["steps"].append({"tool": "requestable-execute-backend", "requestable": requestable, "result": list_result})
        assert_true("error" not in list_result, f"Backend transaction requestable failed for {project}: {requestable}")
        list_results[requestable.split(f"{connector}.list_", 1)[-1]] = list_result
    print(f"[crud-validate] backend transaction requestables ok project={project}", flush=True)
    for entity in entities:
        validate_explicit_seed_rows(list_results.get(generated_entity_name(entity)) or {}, entity, spec)
    print(f"[crud-validate] explicit seed rows ok project={project}", flush=True)
    for relation in ([] if is_crm else relations):
        child_entity = find_entity(spec, relation["fromEntity"])
        parent_entity = find_entity(spec, relation["toEntity"])
        assert_true(child_entity is not None and parent_entity is not None, f"Unable to resolve relation entities for {project}: {relation}")
        child_rows = sql_output_rows(list_results.get(relation["fromEntity"]) or {})
        assert_true(bool(child_rows), f"No child rows available for relation validation in {project}: {relation}")
        child_first_row = child_rows[0]
        assert_true(row_has_key(child_first_row, relation["labelAlias"]), f"Child list facade missing relation label alias {relation['labelAlias']} in {project}")
        child_id = row_value(child_first_row, primary_column(child_entity).upper(), primary_column(child_entity).lower(), "ID", "id")
        assert_true(child_id is not None, f"Unable to extract child id for relation read proof in {project}: {relation}")
        read_requestable = f"{project}.{connector}.read_{entity_singular(child_entity)}"
        read_result = call_tool(
            url,
            "requestable-execute",
            {
                "requestable": read_requestable,
                "variables": {primary_column(child_entity): str(child_id)},
            },
            timeout=120,
        )
        artifact["steps"].append({"tool": "requestable-execute-backend", "requestable": read_requestable, "result": read_result})
        read_row = first_row(read_result or {})
        assert_true(row_has_key(read_row, relation["labelAlias"]), f"Read facade missing relation label alias {relation['labelAlias']} in {project}")
        parent_requestable = f"{project}.{connector}.list_{entity_name(parent_entity)}"
        parent_result = call_tool(url, "requestable-execute", {"requestable": parent_requestable, "variables": "{}"}, timeout=120)
        artifact["steps"].append({"tool": "requestable-execute-backend", "requestable": parent_requestable, "result": parent_result})
        parent_row = first_row(parent_result or {})
        parent_id = row_value(parent_row, primary_column(parent_entity).upper(), primary_column(parent_entity).lower(), "ID", "id")
        assert_true(parent_id is not None, f"Unable to extract parent id for relation proof in {project}: {relation}")
        relation_requestable = f"{project}.{connector}.{relation_requestable_name(relation, relations)}"
        relation_result = call_tool(
            url,
            "requestable-execute",
            {
                "requestable": relation_requestable,
                "variables": {relation["fromField"]: str(parent_id)},
            },
            timeout=120,
        )
        artifact["steps"].append({"tool": "requestable-execute-backend", "requestable": relation_requestable, "result": relation_result})
        relation_rows = sql_output_rows(relation_result or {})
        assert_true(isinstance(relation_rows, list), f"Relation transaction failed for {project}: {relation_requestable}")
        if relation_rows:
            assert_true(row_has_key(relation_rows[0], relation["labelAlias"]), f"Relation transaction missing relation label alias {relation['labelAlias']} in {project}")
    if relations and not is_crm:
        print(f"[crud-validate] relation transactions ok project={project}", flush=True)
    if is_crm:
        company_list_result = call_tool(url, "requestable-execute", {"requestable": f"{project}.{connector}.list_companies", "variables": "{}"}, timeout=120)
        artifact["steps"].append({"tool": "requestable-execute-backend", "requestable": f"{project}.{connector}.list_companies", "result": company_list_result})
        company_row = first_row(company_list_result or {})
        company_id = row_value(company_row, "ID", "id")
        assert_true(company_id is not None, f"Unable to extract a company id for relation proof in {project}")
        relation_result = call_tool(
            url,
            "requestable-execute",
            {
                "requestable": f"{project}.{connector}.list_company_contacts",
                "variables": {"company_id": str(company_id)},
            },
            timeout=120,
        )
        artifact["steps"].append({"tool": "requestable-execute-backend", "requestable": f"{project}.{connector}.list_company_contacts", "result": relation_result})
        assert_true("error" not in relation_result, f"CRM relation transaction failed for {project}")
        print(f"[crud-validate] crm relation transaction ok project={project}", flush=True)

    for entity in entities:
        count_requestable = f"{project}.{connector}.count_{generated_entity_name(entity)}"
        count_result = call_tool(url, "requestable-execute", {"requestable": count_requestable, "variables": "{}"}, timeout=120)
        artifact["steps"].append({"tool": "requestable-execute-backend", "requestable": count_requestable, "result": count_result})
        total = row_value(first_row(count_result), "TOTAL", "total")
        assert_true(int(total) == expected_seed_count(spec, entity), f"Unexpected seed count for {project}.{generated_entity_name(entity)}: {total}")
    print(f"[crud-validate] seed counts ok project={project}", flush=True)

    status_result = call_tool(
        url,
        "crud-status",
        {
            "project": project,
            "connector": connector,
            "facadePrefix": facade_prefix,
            "profile": spec.get("seed", {}).get("profile", ""),
        },
        timeout=120,
    )
    artifact["steps"].append({"tool": "crud-status", "result": status_result})
    assert_true(status_result.get("status") == "ok", f"crud-status did not report a complete CRUD for {project}: {status_result.get('missing')}")
    if relations and not is_crm:
        expected_relation_qnames = sorted(f"{project}.{facade_prefix}_{relation_requestable_name(relation, relations)}" for relation in relations)
        assert_true(
            all(qname in (status_result.get("relations") or {}).get("present", []) or qname in (status_result.get("sequences") or {}).get("present", []) for qname in expected_relation_qnames),
            f"crud-status did not report expected relation requestables for {project}: {status_result}",
        )
    print(f"[crud-validate] crud-status ok project={project}", flush=True)

    artifact_path = artifact_dir / f"{project}.json"
    artifact_path.write_text(json.dumps(artifact, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(f"[crud-validate] completed project={project} artifact={artifact_path}", flush=True)
    return artifact_path, {
        "project": project,
        "driverFamily": upsert.get("driverFamily"),
        "upsertCrudStatus": upsert.get("status"),
        "crudProofBackendStatus": backend_proof.get("status"),
        "crudStatus": status_result.get("status"),
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
    global RUNTIME_BASE
    parser = argparse.ArgumentParser()
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL)
    parser.add_argument("--artifacts-dir", default=str(ROOT / "tests" / "reports" / "crud-validation" / time.strftime("%Y%m%d_%H%M%S")))
    parser.add_argument("--runtime-base", default=str(DEFAULT_RUNTIME_BASE))
    parser.add_argument("--skip-postgresql", action="store_true")
    parser.add_argument("--skip-mariadb", action="store_true")
    parser.add_argument(
        "--scenario",
        action="append",
        choices=["poll", "employees", "pokemon", "scores", "crm", "postgresql", "mariadb"],
        help="Run only the selected scenario(s). Repeat to run multiple.",
    )
    args = parser.parse_args()
    RUNTIME_BASE = Path(args.runtime_base).expanduser().resolve()

    artifact_dir = Path(args.artifacts_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    wait_for_mcp_ready(args.mcp_url, timeout=90)
    deleted_projects = purge_test_projects(args.mcp_url)

    results = {"artifacts": [], "scenarios": [], "deletedProjects": deleted_projects}

    selected = set(args.scenario or [])

    def wants(name):
        return not selected or name in selected

    if wants("poll"):
        poll_spec = scenario_with_suffix(ROOT / "tests" / "fixtures" / "crud" / "spec_poll_hsqldb.json", "")
        artifact_path, summary = validate_runtime(args.mcp_url, poll_spec, artifact_dir)
        results["artifacts"].append(str(artifact_path))
        results["scenarios"].append(summary)

    if wants("employees"):
        employees_spec = scenario_with_suffix(ROOT / "tests" / "fixtures" / "crud" / "spec_employees_companies_hsqldb.json", "")
        artifact_path, summary = validate_runtime(args.mcp_url, employees_spec, artifact_dir)
        results["artifacts"].append(str(artifact_path))
        results["scenarios"].append(summary)

    if wants("pokemon"):
        pokemon_spec = scenario_with_suffix(ROOT / "tests" / "fixtures" / "crud" / "spec_pokemon_hsqldb.json", "")
        artifact_path, summary = validate_runtime(args.mcp_url, pokemon_spec, artifact_dir)
        results["artifacts"].append(str(artifact_path))
        results["scenarios"].append(summary)

    if wants("scores"):
        scores_spec = scenario_with_suffix(ROOT / "tests" / "fixtures" / "crud" / "spec_scoresjeux_hsqldb.json", "")
        artifact_path, summary = validate_runtime(args.mcp_url, scores_spec, artifact_dir)
        results["artifacts"].append(str(artifact_path))
        results["scenarios"].append(summary)

    if wants("crm"):
        crm_hsql_spec = scenario_with_suffix(ROOT / "tests" / "fixtures" / "crud" / "spec_hsqldb.json", "")
        artifact_path, summary = validate_runtime(args.mcp_url, crm_hsql_spec, artifact_dir)
        results["artifacts"].append(str(artifact_path))
        results["scenarios"].append(summary)

    if not args.skip_postgresql and wants("postgresql"):
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

    if not args.skip_mariadb and wants("mariadb"):
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
