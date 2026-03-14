#!/usr/bin/env python3
import argparse
import json
import time
from pathlib import Path

from validate_crud_tools import (
    DEFAULT_MCP_URL,
    assert_true,
    call_tool,
    cleanup_project,
    load_spec,
    unique_project,
    wait_for_mcp_ready,
)

ROOT = Path("/Users/nicolas/git/c8oprj-c8o-mcp")
DEFAULT_SPEC = ROOT / "tests/fixtures/crud/spec_hsqldb.json"
DEFAULT_ARTIFACT_DIR = ROOT / "tests/reports/tree_apply_perf"


def plain_text_node(name, value):
    return {
        "className": "ngx.components.UIText#UIText",
        "name": name,
        "properties": {
            "textValue": {
                "mode": "PLAIN",
                "value": value,
            }
        },
    }


def shared_card_component(name, label, index):
    return {
        "className": "ngx.components.UISharedRegularComponent#UISharedRegularComponent",
        "name": name,
        "properties": {
            "comment": f"Perf probe shared component #{index}.",
        },
        "children": [
            {
                "className": "ngx.components.UIDynamicElement#Card",
                "name": f"{name}Card",
                "children": [
                    {
                        "className": "ngx.components.UIDynamicElement#CardHeader",
                        "name": f"{name}Header",
                        "children": [
                            {
                                "className": "ngx.components.UIDynamicElement#CardTitle",
                                "name": f"{name}TitleSlot",
                                "children": [
                                    plain_text_node(f"{name}TitleText", label),
                                ],
                            }
                        ],
                    },
                    {
                        "className": "ngx.components.UIDynamicElement#CardContent",
                        "name": f"{name}Content",
                        "children": [
                            plain_text_node(f"{name}BodyText", f"Body {index}"),
                            plain_text_node(f"{name}CaptionText", f"Caption {index}"),
                        ],
                    },
                ],
            }
        ],
    }


def build_shared_components_tree(project, components):
    target = f"{project}.Application.NgxApp"
    children = []
    expected_names = []
    for index in range(1, components + 1):
        name = f"PerfShared{index:03d}"
        expected_names.append(name)
        children.append(shared_card_component(name, f"Perf Card {index}", index))
    return target, {"qname": target, "children": children}, expected_names


def count_tree_nodes(node):
    if not isinstance(node, dict):
        return 0
    return 1 + sum(count_tree_nodes(child) for child in node.get("children") or [])


def flatten_tree_names(node, names=None):
    names = names or []
    if isinstance(node, dict):
        name = node.get("name")
        if name:
            names.append(str(name))
        for child in node.get("children") or []:
            flatten_tree_names(child, names)
    return names


def run_profile(url, spec_path, components, artifact_dir, refresh, auto_save, trigger_mobile_builder):
    spec = load_spec(str(spec_path))
    spec["project"] = unique_project(spec["project"] + "_tree_apply")
    if spec["database"]["mode"] == "hsqldb":
        spec["database"]["database"] = spec["project"].lower()
    project = spec["project"]

    wait_for_mcp_ready(url, timeout=60)
    cleanup_project(url, project)

    bootstrap = call_tool(url, "upsert-crud", {"spec": spec, "sequence": True, "ui": False}, timeout=240)
    assert_true(bootstrap.get("status") == "success", f"upsert-crud failed for {project}")

    target, tree, expected_names = build_shared_components_tree(project, components)
    payload = {
        "target": target,
        "tree": tree,
        "mode": "merge",
        "strict": True,
        "autoSave": auto_save,
        "triggerMobileBuilder": trigger_mobile_builder,
        "refresh": refresh,
    }

    started_at = time.time()
    result = call_tool(url, "databaseobject-tree-apply", payload, timeout=600)
    elapsed_ms = round((time.time() - started_at) * 1000, 2)

    tree_snapshot = call_tool(
        url,
        "databaseobject-tree-get",
        {
            "target": target,
            "childrenDepth": 1,
            "properties": "none",
            "limit": components + 20,
        },
        timeout=120,
    )
    runtime_names = set(flatten_tree_names(tree_snapshot.get("tree")))
    missing = sorted(set(expected_names) - runtime_names)

    artifact = {
        "project": project,
        "target": target,
        "components": components,
        "requestedNodeCount": count_tree_nodes(tree),
        "flags": {
            "refresh": refresh,
            "autoSave": auto_save,
            "triggerMobileBuilder": trigger_mobile_builder,
        },
        "bootstrap": bootstrap,
        "treeApply": result,
        "measuredElapsedMs": elapsed_ms,
        "missingSharedComponents": missing,
    }

    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / f"{project}.json"
    artifact_path.write_text(json.dumps(artifact, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    print(json.dumps(
        {
            "project": project,
            "target": target,
            "requestedNodeCount": artifact["requestedNodeCount"],
            "durationMs": result.get("durationMs"),
            "measuredElapsedMs": elapsed_ms,
            "status": result.get("status"),
            "missingSharedComponents": missing,
            "artifact": str(artifact_path),
        },
        indent=2,
        ensure_ascii=True,
    ))

    assert_true(result.get("status") in {"ok", "partial"}, f"databaseobject-tree-apply failed for {project}")
    assert_true(not missing, f"Missing shared components after tree-apply for {project}: {', '.join(missing)}")
    return artifact_path


def parse_args():
    parser = argparse.ArgumentParser(description="Profile NGX databaseobject-tree-apply performance on a fresh starter project.")
    parser.add_argument("--url", default=DEFAULT_MCP_URL)
    parser.add_argument("--spec", default=str(DEFAULT_SPEC))
    parser.add_argument("--components", type=int, default=30)
    parser.add_argument("--artifact-dir", default=str(DEFAULT_ARTIFACT_DIR))
    parser.add_argument("--refresh", action="store_true", help="Request Studio refresh after tree-apply.")
    parser.add_argument("--auto-save", action="store_true", help="Save project at the end of tree-apply.")
    parser.add_argument("--trigger-mobile-builder", action="store_true", help="Trigger mobile builder after tree-apply.")
    return parser.parse_args()


def main():
    args = parse_args()
    run_profile(
        url=args.url,
        spec_path=Path(args.spec),
        components=max(1, args.components),
        artifact_dir=Path(args.artifact_dir),
        refresh=args.refresh,
        auto_save=args.auto_save,
        trigger_mobile_builder=args.trigger_mobile_builder,
    )


if __name__ == "__main__":
    main()
