#!/usr/bin/env python3
import argparse
import json
import time
from pathlib import Path

from validate_crud_tools import DEFAULT_MCP_URL, call_tool, cleanup_project, project_exists, wait_for_mcp_ready


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = ROOT / "tests" / "reports" / "mobile-builder-compile-error" / time.strftime("%Y%m%d_%H%M%S")


def parse_args():
    parser = argparse.ArgumentParser(description="Validate that mobile-builder-open returns compile_error quickly when the live app does not compile.")
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL)
    parser.add_argument("--project", default=f"BuilderCompileProbe_{time.strftime('%Y%m%d_%H%M%S')}")
    parser.add_argument("--artifacts-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--keep-project", action="store_true")
    return parser.parse_args()


def assert_true(condition, message):
    if not condition:
        raise RuntimeError(message)


def broken_page_script():
    return (
        "/*Begin_c8o_PageImport*/\n"
        "/*End_c8o_PageImport*/\n"
        "/*Begin_c8o_PageDeclaration*/\n"
        "const broken = ;\n"
        "/*End_c8o_PageDeclaration*/\n"
        "/*Begin_c8o_PageConstructor*/\n"
        "/*End_c8o_PageConstructor*/\n"
        "/*Begin_c8o_PageFunction*/\n"
        "/*End_c8o_PageFunction*/\n"
    )


def valid_page_script():
    return (
        "/*Begin_c8o_PageImport*/\n"
        "/*End_c8o_PageImport*/\n"
        "/*Begin_c8o_PageDeclaration*/\n"
        "/*End_c8o_PageDeclaration*/\n"
        "/*Begin_c8o_PageConstructor*/\n"
        "/*End_c8o_PageConstructor*/\n"
        "/*Begin_c8o_PageFunction*/\n"
        "/*End_c8o_PageFunction*/\n"
    )


def main():
    args = parse_args()
    artifacts_dir = Path(args.artifacts_dir)
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    project = args.project
    artifact = {
        "project": project,
        "status": "FAIL",
        "steps": [],
    }

    wait_for_mcp_ready(args.mcp_url, timeout=90)
    cleanup_project(args.mcp_url, project)

    try:
        starter_import = call_tool(
            args.mcp_url,
            "marketplace-import",
            {
                "project": "template_ngxBuilderIonic",
                "importedProjectName": project,
            },
            timeout=180,
        )
        artifact["steps"].append({"tool": "marketplace-import", "result": starter_import})
        assert_true(project_exists(args.mcp_url, project), f"marketplace-import did not load {project}")

        warm_builder = call_tool(
            args.mcp_url,
            "mobile-builder-open",
            {
                "project": project,
                "timeoutSec": 180,
                "logsLimit": 60,
                "forceRestart": True,
            },
            timeout=240,
        )
        artifact["steps"].append({"tool": "mobile-builder-open-warmup", "result": warm_builder})
        assert_true(
            warm_builder.get("status") in ("ready", "building"),
            f"Warmup mobile builder did not reach a usable non-error state for {project}: {warm_builder.get('message')}",
        )
        assert_true(not (warm_builder.get("compileErrors") or []), f"Warmup mobile builder exposed compile errors for {project}")

        bad_script = broken_page_script()
        tree_apply = call_tool(
            args.mcp_url,
            "databaseobject-tree-apply",
            {
                "target": f"{project}.Application.NgxApp.Page",
                "at": "self",
                "mode": "merge",
                "tree": {
                    "properties": {
                        "scriptContent": bad_script
                    }
                },
            },
            timeout=180,
        )
        artifact["steps"].append({"tool": "databaseobject-tree-apply", "result": tree_apply})

        mobile_builder = call_tool(
            args.mcp_url,
            "mobile-builder-open",
            {
                "project": project,
                "stateOnly": True,
                "wait": True,
                "timeoutSec": 45,
                "logsLimit": 80,
            },
            timeout=90,
        )
        artifact["steps"].append({"tool": "mobile-builder-open-hmr-error", "result": mobile_builder})

        assert_true(mobile_builder.get("status") == "compile_error", f"Expected compile_error, got {mobile_builder.get('status')}: {mobile_builder.get('message')}")
        assert_true(bool(mobile_builder.get("compileErrors") or []), "compile_error status did not return compileErrors.")
        if mobile_builder.get("build", {}).get("supported") is True:
            assert_true(mobile_builder.get("build", {}).get("observed") is True, "The failing HMR Eclipse build job was not observed.")
            assert_true(mobile_builder.get("build", {}).get("active") is False, "The failing HMR Eclipse build job is still active.")

        repair = call_tool(
            args.mcp_url,
            "databaseobject-tree-apply",
            {
                "target": f"{project}.Application.NgxApp.Page",
                "at": "self",
                "mode": "merge",
                "tree": {
                    "properties": {
                        "scriptContent": valid_page_script()
                    }
                },
            },
            timeout=180,
        )
        artifact["steps"].append({"tool": "databaseobject-tree-apply-repair", "result": repair})

        repaired_builder = call_tool(
            args.mcp_url,
            "mobile-builder-open",
            {
                "project": project,
                "stateOnly": True,
                "wait": True,
                "timeoutSec": 45,
                "logsLimit": 80,
            },
            timeout=90,
        )
        artifact["steps"].append({"tool": "mobile-builder-open-hmr-repair", "result": repaired_builder})
        assert_true(
            repaired_builder.get("status") == "ready",
            f"Expected ready after HMR repair, got {repaired_builder.get('status')}: {repaired_builder.get('message')}",
        )
        if repaired_builder.get("build", {}).get("supported") is True:
            assert_true(repaired_builder.get("build", {}).get("observed") is True, "The repaired HMR Eclipse build job was not observed.")
            assert_true(repaired_builder.get("build", {}).get("active") is False, "The repaired HMR Eclipse build job is still active.")

        no_change_apply = call_tool(
            args.mcp_url,
            "databaseobject-tree-apply",
            {
                "target": f"{project}.Application.NgxApp.Page",
                "at": "self",
                "mode": "merge",
                "tree": {
                    "properties": {
                        "scriptContent": valid_page_script()
                    }
                },
            },
            timeout=180,
        )
        artifact["steps"].append({"tool": "databaseobject-tree-apply-no-change", "result": no_change_apply})

        no_change_started = time.monotonic()
        no_change_builder = call_tool(
            args.mcp_url,
            "mobile-builder-open",
            {
                "project": project,
                "stateOnly": True,
                "wait": True,
                "timeoutSec": 30,
                "logsLimit": 40,
            },
            timeout=60,
        )
        no_change_elapsed = time.monotonic() - no_change_started
        artifact["steps"].append({
            "tool": "mobile-builder-open-no-change",
            "elapsedSeconds": no_change_elapsed,
            "result": no_change_builder,
        })
        assert_true(
            no_change_builder.get("status") == "ready",
            f"Expected ready after a no-change generation, got {no_change_builder.get('status')}: {no_change_builder.get('message')}",
        )
        generation = no_change_builder.get("build", {}).get("generation", {})
        assert_true(generation.get("supported") is True, "Portable Engine source-generation tracking is unavailable.")
        assert_true(generation.get("noChange") is True, f"Expected a no_change generation, got {generation}.")
        assert_true(generation.get("changedFileCount") == 0, f"No-change generation reported changed files: {generation}.")
        assert_true(no_change_elapsed < 10, f"No-change generation took too long to settle: {no_change_elapsed:.2f}s.")
        artifact["status"] = "PASS"
    finally:
        (artifacts_dir / "artifact.json").write_text(json.dumps(artifact, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        if not args.keep_project:
            cleanup_project(args.mcp_url, project)

    if artifact["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
