#!/usr/bin/env python3
import argparse
import json
import time
from pathlib import Path

from validate_crud_tools import DEFAULT_MCP_URL, call_tool, cleanup_project, load_spec, project_exists, wait_for_mcp_ready


ROOT = Path("/Users/nicolas/git/c8oprj-c8o-mcp")
DEFAULT_SPEC_PATH = ROOT / "tests" / "fixtures" / "crud" / "spec_irregular_plural_hsqldb.json"
DEFAULT_OUTPUT_DIR = ROOT / "tests" / "reports" / "crud-name-overrides" / time.strftime("%Y%m%d_%H%M%S")


def parse_args():
    parser = argparse.ArgumentParser(description="Validate CRUD singular/plural/routeSegment overrides on the fast path.")
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL)
    parser.add_argument("--spec-path", default=str(DEFAULT_SPEC_PATH))
    parser.add_argument("--project", default=f"NameOverrideProbe_{time.strftime('%Y%m%d_%H%M%S')}")
    parser.add_argument("--artifacts-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--keep-project", action="store_true")
    return parser.parse_args()


def assert_true(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    args = parse_args()
    artifacts_dir = Path(args.artifacts_dir)
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    spec = load_spec(args.spec_path)
    spec["project"] = args.project
    spec["database"]["database"] = args.project.lower()
    artifact = {
        "project": args.project,
        "status": "FAIL",
        "steps": [],
    }

    wait_for_mcp_ready(args.mcp_url, timeout=90)
    cleanup_project(args.mcp_url, args.project)

    try:
        starter_import = call_tool(
            args.mcp_url,
            "marketplace-import",
            {
                "project": "template_ngxBuilderIonic",
                "importedProjectName": args.project,
            },
            timeout=180,
        )
        artifact["steps"].append({"tool": "marketplace-import", "result": starter_import})
        assert_true(project_exists(args.mcp_url, args.project), f"marketplace-import did not load {args.project}")

        upsert = call_tool(args.mcp_url, "upsert-crud", {"spec": spec, "sequence": True, "ui": False}, timeout=240)
        artifact["steps"].append({"tool": "upsert-crud", "result": upsert})
        assert_true(upsert.get("status") == "success", f"upsert-crud failed for {args.project}")

        bootstrap = call_tool(
            args.mcp_url,
            "upsert-ngx-crud-kit",
            {
                "project": args.project,
                "entities": spec["entities"],
                "variant": "entity-pages",
                "stage": "bootstrap",
                "facadePrefix": "crud",
                "entryPage": "Page",
            },
            timeout=180,
        )
        artifact["steps"].append({"tool": "upsert-ngx-crud-kit-bootstrap", "result": bootstrap})
        assert_true(bootstrap.get("status") == "success", f"Bootstrap UI failed for {args.project}")

        final_ui = call_tool(
            args.mcp_url,
            "upsert-ngx-crud-kit",
            {
                "project": args.project,
                "entities": spec["entities"],
                "variant": "entity-pages",
                "stage": "final",
                "facadePrefix": "crud",
                "entryPage": "Page",
            },
            timeout=180,
        )
        artifact["steps"].append({"tool": "upsert-ngx-crud-kit-final", "result": final_ui})
        assert_true(final_ui.get("status") == "success", f"Final UI failed for {args.project}")

        runtime = final_ui.get("runtimeEvidence") or {}
        assert_true(runtime.get("pageRoutes") == ["/home", "/animaux"], f"Unexpected pageRoutes: {runtime.get('pageRoutes')}")
        assert_true(runtime.get("pageNames") == ["Page", "AnimauxPage"], f"Unexpected pageNames: {runtime.get('pageNames')}")

        ngx_tree = call_tool(
            args.mcp_url,
            "databaseobject-tree-get",
            {
                "target": f"{args.project}.Application.NgxApp",
                "childrenDepth": 2,
                "properties": "changed",
                "limit": 400,
            },
            timeout=120,
        )
        artifact["steps"].append({"tool": "databaseobject-tree-get", "result": ngx_tree})
        serialized = json.dumps(ngx_tree, ensure_ascii=False)
        for token in ("AnimauxListPanel", "AnimauxDetailCard", "AnimauxEditForm", "crud_refresh_animaux", "crud_select_animal", "crud_open_animaux_page"):
            assert_true(token in serialized, f"Missing override token {token} in generated tree.")

        artifact["status"] = "PASS"
    finally:
        (artifacts_dir / "artifact.json").write_text(json.dumps(artifact, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        if not args.keep_project:
            cleanup_project(args.mcp_url, args.project)

    if artifact["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
