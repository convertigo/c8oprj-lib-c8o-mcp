#!/usr/bin/env python3
"""Offline tests of scripts/yaml_mcp_delta_apply.py: comparisons, payloads, batch judgment, rollback check
and save check, against a fake MCP client (standard library only).

    python3 tests/scripts/test_yaml_mcp_delta_apply.py
"""

from __future__ import annotations

import copy
import io
import json
import sys
import tempfile
import unittest
import urllib.request
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import yaml_mcp_delta_apply as m  # noqa: E402


def node_of(text: str) -> m.YamlNode:
    """The YamlNode of a YAML file's content."""
    document = m.EngineYamlReader(text, Path("test.yaml")).read_document()
    return m.bean_to_node(document, "__root__", None, False)


def source_vector(priority: str, xpath: str = "./document", indent: str = "  ") -> str:
    return (
        f"{indent}sourceDefinition: \n"
        f"{indent}  - xmlizable: \n"
        f"{indent}    - ↑classname: com.twinsoft.convertigo.beans.common.XMLVector\n"
        f"{indent}    - com.twinsoft.convertigo.beans.common.XMLVector: \n"
        f"{indent}      - java.lang.String: \n"
        f"{indent}        - ↑value: {priority}\n"
        f"{indent}      - java.lang.String: \n"
        f"{indent}        - ↑value: {xpath}\n"
    )


class FakeClient:
    """Answers tool calls from handlers: a value (copied) or a function(arguments, meta)."""

    def __init__(self, handlers: dict[str, Any]):
        self.handlers = handlers
        self.calls: list[tuple[str, dict[str, Any], dict[str, Any] | None]] = []

    def tool_call(self, name: str, arguments: dict[str, Any], meta: dict[str, Any] | None = None) -> dict[str, Any]:
        self.calls.append((name, copy.deepcopy(arguments), meta))
        handler = self.handlers.get(name)
        if handler is None:
            raise RuntimeError(f"{name} failed: no handler")
        return handler(arguments, meta) if callable(handler) else copy.deepcopy(handler)

    def names(self) -> list[str]:
        return [name for name, _args, _meta in self.calls]


def reset_globals() -> None:
    m.CREATED_QNAMES.clear()
    m.CREATED_FILE_ROOTS.clear()
    m.DEFERRED_SOURCES.clear()
    m._PALETTE_CACHE.clear()
    m._SUBFILE_ROOTS.clear()
    m.SUBFILE_BASE[:] = []
    m.ROOT_CLEARS.clear()
    m.ROOT_SETS.clear()
    m.RECHECK[0] = False


class Base(unittest.TestCase):
    def setUp(self) -> None:
        reset_globals()

    def tearDown(self) -> None:
        reset_globals()


class ComparisonTests(Base):
    def test_symbol_is_compared_as_written(self) -> None:
        # tree-get gives the source of a symbol: a literal in the Studio is a difference.
        self.assertFalse(m.text_matches("SA", "${pfdelta.user=SA}"))
        self.assertTrue(m.scalar_text_equal("${pfdelta.user=SA}", "${pfdelta.user=SA}"))
        self.assertFalse(m.values_equal({"mode": "JS", "expression": "x"}, {"mode": "JS", "expression": "${a=x}"}))

    def test_scalars_and_smarttypes(self) -> None:
        self.assertTrue(m.scalar_text_equal(True, "true"))
        self.assertTrue(m.scalar_text_equal(60, "60"))
        self.assertTrue(m.values_equal({"mode": "SOURCE", "sources": ["1", "."]}, {"mode": "SOURCE", "sources": ["1", "."]}))
        self.assertFalse(m.values_equal({"mode": "SOURCE", "sources": ["2", "."]}, {"mode": "SOURCE", "sources": ["1", "."]}))


class TreeGetTests(Base):
    def test_long_values_are_read_whole(self) -> None:
        client = FakeClient({"databaseobject-tree-get": {"tree": {"qname": "P.s", "properties": {}}}})
        m.get_runtime_tree(client, "P.s", children_depth=1, properties_mode="all", limit=5000)
        m.get_runtime_tree(client, "P.s", children_depth=1, properties_mode="none", limit=5000)
        self.assertEqual(client.calls[0][1].get("maxValueLength"), 0)
        self.assertNotIn("maxValueLength", client.calls[1][1])

    def test_pages_are_followed_and_merged(self) -> None:
        pages = {
            None: {"hasMore": True, "nextCursor": "2", "tree": {"qname": "P.s", "properties": {"a": 1}, "children": [
                {"qname": "P.s.x", "name": "x", "className": "steps.SimpleStep", "properties": {"e": "1"}},
                {"qname": "P.s.blk", "name": "blk", "className": "steps.IfStep", "properties": {"c": "t"}, "children": [
                    {"qname": "P.s.blk.i1", "name": "i1", "className": "steps.SimpleStep", "properties": {}}]}]}},
            "2": {"hasMore": False, "tree": {"qname": "P.s", "properties": {"a": 1}, "children": [
                {"qname": "P.s.blk", "name": "blk", "className": "steps.IfStep", "partial": True, "children": [
                    {"qname": "P.s.blk.i2", "name": "i2", "className": "steps.SimpleStep", "properties": {}}]},
                {"qname": "P.s.y", "name": "y", "className": "steps.SimpleStep", "properties": {}}]}},
        }
        client = FakeClient({"databaseobject-tree-get": lambda args, meta: copy.deepcopy(pages[(meta or {}).get("nextCursor")])})
        tree, warnings = m.get_runtime_tree(client, "P.s", children_depth=2, properties_mode="all", limit=5000)
        self.assertEqual(warnings, [])
        self.assertEqual([c["name"] for c in tree["children"]], ["x", "blk", "y"])
        blk = tree["children"][1]
        self.assertEqual([c["name"] for c in blk["children"]], ["i1", "i2"])
        self.assertEqual(blk["properties"], {"c": "t"})
        self.assertEqual(client.calls[1][2], {"nextCursor": "2"})

    def test_a_page_without_cursor_is_reported(self) -> None:
        client = FakeClient({"databaseobject-tree-get": {"hasMore": True, "tree": {"qname": "P.s"}}})
        _tree, warnings = m.get_runtime_tree(client, "P.s", children_depth=1, properties_mode="none", limit=5)
        self.assertTrue(warnings and warnings[0].startswith(m.NOT_APPLIED))

    def test_full_subtree_reads_past_depth_20(self) -> None:
        def tree_get(args: dict[str, Any], _meta: Any) -> dict[str, Any]:
            if args["target"] == "P.s":
                return {"tree": {"qname": "P.s", "directChildrenCount": 1, "children": [
                    {"qname": "P.s.deep", "name": "deep", "className": "steps.IfStep", "directChildrenCount": 1}]}}
            return {"tree": {"qname": "P.s.deep", "directChildrenCount": 1, "children": [
                {"qname": "P.s.deep.leaf", "name": "leaf", "className": "steps.SimpleStep", "directChildrenCount": 0}]}}
        client = FakeClient({"databaseobject-tree-get": tree_get})
        tree, _w = m.get_full_subtree(client, "P.s")
        self.assertEqual(tree["children"][0]["children"][0]["name"], "leaf")


class StepSourceTests(Base):
    SEQ = (
        "↓init [steps.SimpleStep-100]: \n  expression: var x = 1;\n"
        "↓renamed [steps.SimpleStep-200]: \n  expression: var y = 2;\n"
        "↓src [steps.JsonSourceStep-300]: \n" + source_vector("200") + "  variableName: v\n"
        "↓other [steps.JsonSourceStep-400]: \n" + source_vector("100") + "  variableName: w\n"
    )

    def runtime(self, renamed_name: str = "old", renamed_class: str = "steps.SimpleStep") -> dict[str, Any]:
        return {"qname": "P.sq:s", "className": "sequences.GenericSequence", "children": [
            {"qname": "P.sq:s.st:init", "name": "init", "className": "steps.SimpleStep", "priority": "100"},
            {"qname": f"P.sq:s.st:{renamed_name}", "name": renamed_name, "className": renamed_class, "priority": "200"},
            {"qname": "P.sq:s.st:src", "name": "src", "className": "steps.JsonSourceStep", "priority": "300"},
            {"qname": "P.sq:s.st:other", "name": "other", "className": "steps.JsonSourceStep", "priority": "400"},
        ]}

    def test_priorities_are_read_from_the_keys(self) -> None:
        node = node_of(self.SEQ)
        self.assertEqual([c.priority for c in node.children], ["100", "200", "300", "400"])
        self.assertEqual(m.parse_child_decl("a [steps.IfStep-12]", False, 1).priority, "12")
        self.assertEqual(m.parse_child_decl("a [steps.IfStep]", False, 1).priority, "")

    def test_source_shapes(self) -> None:
        self.assertEqual(m.source_pairs("sourceDefinition", ["1", "."]), [["1", "."]])
        self.assertEqual(m.source_pairs("value", {"mode": "SOURCE", "sources": ["2", "./a"]}), [["2", "./a"]])
        rows = [["description", ["3", "./b"], ""], ["description", [], "x"]]
        self.assertEqual(m.source_pairs("sourcesDefinition", rows), [["3", "./b"]])
        self.assertEqual(m.source_pairs("connectionStringDefinition", ["4", "./url"]), [["4", "./url"]])
        self.assertEqual(m.source_pairs("startDefinition", ["5", "."]), [["5", "."]])
        self.assertEqual(m.source_pairs("testDefinition", [["AND", "true"]]), [])
        self.assertEqual(m.source_pairs("expression", "var a;"), [])
        self.assertEqual(m.source_pairs("sourceDefinition", ["", ""]), [])

    def test_translate(self) -> None:
        node = node_of(self.SEQ)
        scope = m.StepScope(node, self.runtime(), structural=True)
        # init is in the Studio with the same class: its Studio priority is sent.
        value, unsettled = scope.translate("sourceDefinition", ["100", "."])
        self.assertEqual((value, unsettled), (["100", "."], []))
        # renamed is not in the Studio under that name: it gets its priority from the batch.
        value, unsettled = scope.translate("sourceDefinition", ["200", "."])
        self.assertEqual(unsettled, [("renamed",)])
        # A priority no YAML step has is sent as written.
        self.assertEqual(scope.translate("sourceDefinition", ["999", "."]), (["999", "."], []))

    def test_a_studio_priority_other_than_the_yaml_one(self) -> None:
        runtime = self.runtime(renamed_name="renamed")
        runtime["children"][1]["priority"] = "777"
        scope = m.StepScope(node_of(self.SEQ), runtime, structural=True)
        self.assertEqual(scope.translate("sourceDefinition", ["200", "./x"]), (["777", "./x"], []))

    def test_a_replaced_step_is_not_settled(self) -> None:
        runtime = self.runtime(renamed_name="renamed", renamed_class="steps.IfStep")
        self.assertEqual(m.StepScope(node_of(self.SEQ), runtime, structural=True).translate("sourceDefinition", ["200", "."])[1], [("renamed",)])
        # Without --structural the step is not replaced: it keeps its Studio priority.
        self.assertEqual(m.StepScope(node_of(self.SEQ), runtime, structural=False).translate("sourceDefinition", ["200", "."]), (["200", "."], []))

    def test_a_shared_priority_is_sent_as_written(self) -> None:
        node = node_of("↓a [steps.SimpleStep-5]: \n  expression: a\n↓b [steps.SimpleStep-5]: \n  expression: b\n")
        self.assertEqual(m.StepScope(node, None, structural=True).translate("sourceDefinition", ["5", "."]), (["5", "."], []))

    def test_nested_steps_have_paths(self) -> None:
        node = node_of("↓blk [steps.IfStep-1]: \n  condition: true\n  ↓in [steps.SimpleStep-2]: \n    expression: a\n")
        scope = m.StepScope(node, {"children": [{"name": "blk", "className": "steps.IfStep", "priority": "1", "children": [
            {"name": "in", "className": "steps.SimpleStep", "priority": "22"}]}]}, structural=True)
        self.assertEqual(scope.translate("value", {"mode": "SOURCE", "sources": ["2", "."]}), ({"mode": "SOURCE", "sources": ["22", "."]}, []))

    def test_update_of_a_step_sourcing_a_renamed_step_is_deferred(self) -> None:
        node = node_of(self.SEQ)
        scope = m.StepScope(node, self.runtime(), structural=True)
        src = node.children[2]
        tree = {"qname": "P.sq:s.st:src", "className": "steps.JsonSourceStep", "properties": {
            "sourceDefinition": ["200", "./document"], "variableName": "v"}}
        client = FakeClient({"palette-describe": {"propertyHints": []}})
        updates, warnings, _previous = m.compute_updates_for_qname(client, "P.sq:s.st:src", src.scalar_props, runtime_tree=tree, scope=scope)
        # The Studio value names the old step: equal as texts, but left to the second pass.
        self.assertEqual(updates, {})
        self.assertEqual(warnings, [])
        self.assertEqual(len(m.DEFERRED_SOURCES), 1)

    def test_second_pass_sends_the_new_priority(self) -> None:
        node = node_of(self.SEQ)
        runtime = self.runtime(renamed_name="renamed")
        runtime["children"][1]["priority"] = "555"
        scope = m.StepScope(node, runtime, structural=True)
        tree = {"qname": "P.sq:s.st:src", "className": "steps.JsonSourceStep", "properties": {
            "sourceDefinition": ["200", "./document"], "variableName": "v"}}
        client = FakeClient({"palette-describe": {"propertyHints": []}})
        m.RECHECK[0] = True
        updates, _w, _p = m.compute_updates_for_qname(client, "P.sq:s.st:src", node.children[2].scalar_props, runtime_tree=tree, scope=scope)
        self.assertEqual(updates, {"sourceDefinition": ["555", "./document"]})
        tree["properties"]["sourceDefinition"] = ["555", "./document"]
        updates, _w, _p = m.compute_updates_for_qname(client, "P.sq:s.st:src", node.children[2].scalar_props, runtime_tree=tree, scope=scope)
        self.assertEqual(updates, {})

    def test_create_payload_leaves_out_a_source_on_a_new_step(self) -> None:
        node = node_of(self.SEQ + "↓newA [steps.SimpleStep-111]: \n  expression: a\n↓newB [steps.JsonSourceStep-112]: \n"
                       + source_vector("111") + "↓newC [steps.JsonSourceStep-113]: \n" + source_vector("100"))
        scope = m.StepScope(node, self.runtime(renamed_name="renamed"), structural=True)
        new_b = m.yaml_node_to_tree_payload(node.children[5], scope, "P.s.newB")
        new_c = m.yaml_node_to_tree_payload(node.children[6], scope, "P.s.newC")
        self.assertNotIn("sourceDefinition", new_b.get("properties", {}))
        self.assertEqual(new_c["properties"]["sourceDefinition"], ["100", "./document"])
        self.assertEqual(len(m.DEFERRED_SOURCES), 1)

    def test_new_sequence_file_defers_its_inner_sources(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "sequences").mkdir()
            (base / "sequences" / "n.yaml").write_text(
                "↓one [steps.SimpleStep-1]: \n  expression: a\n↓two [steps.JsonSourceStep-2]: \n" + source_vector("1"), encoding="utf-8")
            m.SUBFILE_BASE[:] = [base]
            project = node_of("↓n [sequences.GenericSequence]: 🗏 sequences/n.yaml\n")
            payload = m.yaml_node_to_tree_payload(project.children[0], None, "P.n")
            self.assertEqual(payload["className"], "sequences.GenericSequence")
            self.assertNotIn("sourceDefinition", payload["children"][1].get("properties", {}))
            self.assertIn("P.n", m.CREATED_FILE_ROOTS)
            self.assertEqual(len(m.DEFERRED_SOURCES), 1)


class MeaningTests(Base):
    def test_renumbered_step_and_source_mean_the_same(self) -> None:
        before = "↓a [steps.SimpleStep-100]: \n  expression: x\n↓b [steps.JsonSourceStep-2]: \n" + source_vector("100")
        after = "↓a [steps.SimpleStep-555]: \n  expression: x\n↓b [steps.JsonSourceStep-2]: \n" + source_vector("555")
        self.assertEqual(m.yaml_meaning(Path("s.yaml"), before), m.yaml_meaning(Path("s.yaml"), after))

    def test_other_definition_vectors_are_sources(self) -> None:
        def text(priority: str) -> str:
            return ("↓a [steps.SimpleStep-" + priority + "]: \n  expression: x\n↓t [steps.TransactionStep-2]: \n"
                    + source_vector(priority).replace("sourceDefinition", "connectionStringDefinition"))
        self.assertEqual(m.yaml_meaning(Path("s.yaml"), text("100")), m.yaml_meaning(Path("s.yaml"), text("555")))

    def test_a_dangling_source_shows(self) -> None:
        before = "↓a [steps.SimpleStep-100]: \n  expression: x\n↓b [steps.JsonSourceStep-2]: \n" + source_vector("100")
        after = "↓a [steps.SimpleStep-555]: \n  expression: x\n↓b [steps.JsonSourceStep-2]: \n" + source_vector("100")
        self.assertNotEqual(m.yaml_meaning(Path("s.yaml"), before), m.yaml_meaning(Path("s.yaml"), after))

    def test_property_order_means_nothing(self) -> None:
        a = ("↓q [transactions.SqlTransaction]: \n  comment: Lit les postes\n  autoCommit: 2\n  sqlQuery: SELECT 1\n"
             "  ↓id [variables.RequestableVariable-11]: \n    description: id\n")
        b = ("↓q [transactions.SqlTransaction]: \n  autoCommit: 2\n  comment: Lit les postes\n  sqlQuery: SELECT 1\n"
             "  ↓id [variables.RequestableVariable-12]: \n    description: id\n")
        self.assertEqual(m.yaml_meaning(Path("db.yaml"), a), m.yaml_meaning(Path("db.yaml"), b))
        c = a.replace("SELECT 1", "SELECT 2")
        self.assertNotEqual(m.yaml_meaning(Path("db.yaml"), a), m.yaml_meaning(Path("db.yaml"), c))

    def test_project_version_left_out_on_request(self) -> None:
        a = "↑convertigo: 8.4.0.m006\n↓P [core.Project]: \n  version: 1.0.0\n"
        b = "↑convertigo: 8.4.0.m006\n↓P [core.Project]: \n  version: 1.0.1\n"
        self.assertNotEqual(m.yaml_meaning(Path("c8oProject.yaml"), a), m.yaml_meaning(Path("c8oProject.yaml"), b))
        self.assertEqual(m.yaml_meaning(Path("c8oProject.yaml"), a, True), m.yaml_meaning(Path("c8oProject.yaml"), b, True))


class BatchTests(Base):
    WARNING = 'tree_apply_root_create: P.sq:s.st:cond: condition "a && b" evaluates to the value of b'

    def calls(self) -> list[dict[str, Any]]:
        return [
            {"tool": "databaseobject-tree-apply", "arguments": {"target": "P.s", "tree": {"name": "cond"}}, "_phase": m.PHASE_CREATE,
             "_undo": {"kind": "create", "qname": "P.s.cond", "parent": "P.s", "order": []}},
            {"tool": "databaseobject-delete", "arguments": {"qname": "P.s.old"}, "_phase": m.PHASE_DELETE,
             "_undo": {"kind": "delete", "qname": "P.s.old", "parent": "P.s", "tree": None, "snapshot": None, "order": []}},
        ]

    def test_a_warning_is_no_error(self) -> None:
        report = {"index": 0, "status": "partial", "warnings": [self.WARNING], "errors": [],
                  "payload": {"status": "partial", "errors": [], "warnings": [self.WARNING]}}
        self.assertEqual(m.call_report_errors(report), [])
        self.assertEqual(m.call_report_warnings(report), [self.WARNING])

    def test_partial_errors_and_omitted_reports_are_errors(self) -> None:
        self.assertEqual(m.call_report_errors({"status": "partial", "payload": {"errors": [{"message": "boom"}]}}), ["boom"])
        self.assertTrue(m.call_report_errors({"status": "partial", "payloadOmitted": {"characters": 30000}}))

    def test_deletes_run_after_a_clean_first_batch_and_warnings_are_kept(self) -> None:
        sent: list[list[str]] = []

        def batch(args: dict[str, Any], _meta: Any) -> dict[str, Any]:
            sent.append([c["tool"] for c in args["calls"]])
            self.assertEqual(args["responseDetail"], "full")
            first = args["calls"][0]["tool"] == "databaseobject-tree-apply"
            report = {"index": 0, "status": "partial" if first else "applied", "warnings": [self.WARNING] if first else [],
                      "payload": {"status": "partial" if first else "ok", "errors": [], "warnings": [self.WARNING] if first else []}}
            return {"status": "partial" if first else "ok", "calls": [report], "summary": {"planned": 1, "applied": 1}, "errors": []}

        client = FakeClient({"batch-call": batch})
        warnings: list[str] = []
        with redirect_stdout(io.StringIO()):
            code = m.run_mutation_batch(client, m.order_mutation_calls(self.calls()), warnings)
        self.assertIsNone(code)
        self.assertEqual(sent, [["databaseobject-tree-apply"], ["databaseobject-delete"]])
        self.assertEqual(warnings, [self.WARNING])

    def test_no_delete_after_a_failed_first_batch(self) -> None:
        sent: list[list[str]] = []

        def batch(args: dict[str, Any], _meta: Any) -> dict[str, Any]:
            sent.append([c["tool"] for c in args["calls"]])
            return {"status": "failed", "calls": [{"index": 0, "status": "failed", "errors": [{"message": "Unable to instantiate"}]}],
                    "errors": [], "stop": {"message": "Unable to instantiate"}}

        def tree_get(_args: dict[str, Any], _meta: Any) -> dict[str, Any]:
            raise RuntimeError("databaseobject-tree-get failed: not found")

        client = FakeClient({"batch-call": batch, "databaseobject-tree-get": tree_get})
        err = io.StringIO()
        with redirect_stdout(io.StringIO()), redirect_stderr(err):
            code = m.run_mutation_batch(client, m.order_mutation_calls(self.calls()), [])
        self.assertEqual(code, 2)
        self.assertEqual(sent, [["databaseobject-tree-apply"]])
        self.assertIn("ROLLBACK: done and checked", err.getvalue())

    def test_second_pass_failure_says_the_first_stays(self) -> None:
        client = FakeClient({"batch-call": {"status": "failed", "calls": [{"index": 0, "status": "failed", "errors": [{"message": "x"}]}], "errors": []},
                             "databaseobject-tree-get": lambda a, mt: (_ for _ in ()).throw(RuntimeError("not found"))})
        err = io.StringIO()
        with redirect_stdout(io.StringIO()), redirect_stderr(err):
            m.run_mutation_batch(client, self.calls()[:1], [], pass_number=2)
        self.assertIn("the first pass stays applied", err.getvalue())

    def test_object_literal_hint(self) -> None:
        literal = [{"arguments": {"tree": {"properties": {"value": {"mode": "JS", "expression": " {a: 1}"}}}}}]
        plain = [{"arguments": {"tree": {"properties": {"value": {"mode": "JS", "expression": "a"}}}}}]
        self.assertTrue(m.holds_object_literal_expression(literal))
        self.assertFalse(m.holds_object_literal_expression(plain))


class RollbackTests(Base):
    def test_restorable_tree_keeps_what_tree_apply_can_set(self) -> None:
        hints = [
            {"name": "httpParameters", "type": "com.twinsoft.convertigo.beans.common.XMLVector", "defaultValue": "[[Content-Type, x]]"},
            {"name": "xmlTypeAffectation", "type": "com.twinsoft.convertigo.beans.common.XmlQName", "defaultValue": "string{x}"},
            {"name": "comment", "type": "java.lang.String", "defaultValue": ""},
        ]
        client = FakeClient({"palette-describe": {"propertyHints": hints}})
        tree = {"name": "t", "className": "transactions.HttpTransaction", "properties": {
            "httpParameters": [["Accept", "json"]], "xmlTypeAffectation": "custom{y}", "comment": ""}}
        self.assertEqual(m.restorable_tree(client, tree)["properties"], {"httpParameters": [["Accept", "json"]]})

    def test_subtree_differences(self) -> None:
        before = {"className": "steps.SimpleStep", "priority": "1", "properties": {"expression": "a"}, "children": [
            {"name": "x", "className": "steps.SimpleStep", "properties": {}}, {"name": "y", "className": "steps.SimpleStep", "properties": {}}]}
        after = {"className": "steps.SimpleStep", "priority": "9", "properties": {"expression": "b"}, "children": [
            {"name": "y", "className": "steps.SimpleStep", "properties": {}}, {"name": "x", "className": "steps.SimpleStep", "properties": {}}]}
        differences = m.subtree_differences(before, after, "P.s.t")
        self.assertTrue(any("priority 9, was 1" in d for d in differences))
        self.assertTrue(any("expression" in d for d in differences))
        self.assertTrue(any("children order" in d for d in differences))
        self.assertEqual(m.subtree_differences(before, copy.deepcopy(before), "P.s.t"), [])
        # Outside steps a priority only orders siblings.
        component = {"className": "ngx.components.UIDynamicElement#Button", "priority": "1", "properties": {}}
        self.assertEqual(m.subtree_differences(component, dict(component, priority="2"), "P.c"), [])

    def test_order_moves(self) -> None:
        order = ["a", "c", "b", "d"]
        moves = m.order_moves(["a", "b", "c", "d"], order)
        self.assertEqual(len(moves), 1)
        self.assertEqual(order, ["a", "b", "c", "d"])

    def test_rollback_reports_what_still_differs(self) -> None:
        state = {"expression": "edited"}

        def batch(args: dict[str, Any], _meta: Any) -> dict[str, Any]:
            # The inverse property update does not take.
            return {"calls": [{"index": i, "status": "applied"} for i, _c in enumerate(args["calls"])]}

        client = FakeClient({
            "batch-call": batch,
            "databaseobject-tree-get": lambda a, mt: {"tree": {"qname": a["target"], "properties": dict(state)}},
        })
        applied = [{"tool": "databaseobject-tree-apply", "arguments": {"tree": {"properties": {"expression": "edited"}}},
                    "_status": "applied", "_undo": {"kind": "properties", "qname": "P.s.a", "previous": {"expression": "orig"}}}]
        failures = m.rollback_mutations(client, applied)
        self.assertEqual(len(failures), 1)
        self.assertIn("still different after the rollback", failures[0])


class StructureTests(Base):
    def test_left_out_without_structural(self) -> None:
        node = node_of("↓b [steps.SimpleStep-2]: \n  expression: b\n↓a [steps.IfStep-1]: \n  condition: x\n↓n [steps.SimpleStep-3]: \n  expression: n\n")
        runtime = [
            {"name": "a", "qname": "P.s.a", "className": "steps.SimpleStep"},
            {"name": "b", "qname": "P.s.b", "className": "steps.SimpleStep"},
            {"name": "gone", "qname": "P.s.gone", "className": "steps.SimpleStep"},
        ]
        matched, _w = m.match_runtime_children("P.s", node.children, runtime)
        warnings = m.structure_left_out("P.s", node.children, runtime, matched)
        text = "\n".join(warnings)
        self.assertTrue(all(w.startswith(m.NOT_APPLIED) for w in warnings))
        self.assertIn("'n' (line 5) is not in the Studio", text)
        self.assertIn("'a' is a steps.SimpleStep in the Studio", text)
        self.assertIn("'gone' is no longer in the YAML", text)
        self.assertIn("orders its steps otherwise", text)

    def test_matching_children_report_nothing(self) -> None:
        node = node_of("↓a [steps.SimpleStep-1]: \n  expression: a\n↓b [steps.SimpleStep-2]: \n  expression: b\n")
        runtime = [{"name": "a", "qname": "P.s.a", "className": "steps.SimpleStep"}, {"name": "b", "qname": "P.s.b", "className": "steps.SimpleStep"}]
        matched, _w = m.match_runtime_children("P.s", node.children, runtime)
        self.assertEqual(m.structure_left_out("P.s", node.children, runtime, matched), [])

    def test_missing_subfiles(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            m.SUBFILE_BASE[:] = [Path(tmp)]
            (Path(tmp) / "here.yaml").write_text("↓in [steps.SimpleStep-1]: \n  expression: a\n", encoding="utf-8")
            node = node_of("↓a [sequences.GenericSequence]: 🗏 here.yaml\n↓b [sequences.GenericSequence]: 🗏 gone.yaml\n")
            self.assertEqual(m.file_refs(node), ["here.yaml", "gone.yaml"])
            self.assertEqual(m.missing_subfiles(node.children[0]), [])
            self.assertEqual(m.missing_subfiles(node.children[1]), ["gone.yaml"])


class ReplacementTests(Base):
    RUNTIME = [
        {"name": "a", "qname": "P.sq:s.st:a", "className": "steps.SimpleStep", "priority": "1"},
        {"name": "b", "qname": "P.sq:s.st:b", "className": "steps.SimpleStep", "priority": "2"},
    ]

    def plan(self, yaml: str, tree_get: Any) -> tuple[list[dict[str, Any]], list[str]]:
        client = FakeClient({"databaseobject-tree-get": tree_get, "palette-describe": {"propertyHints": []}})
        calls: list[dict[str, Any]] = []
        with redirect_stdout(io.StringIO()):
            _ops, _d, warnings, _q, _c = m.apply_structural_for_parent(
                client, "P.sq:s", node_of(yaml).children, False, calls, copy.deepcopy(self.RUNTIME))
        return calls, warnings

    def test_no_delete_without_a_snapshot(self) -> None:
        def tree_get(args: dict[str, Any], _meta: Any) -> dict[str, Any]:
            raise RuntimeError("databaseobject-tree-get failed: busy")
        # b becomes an IfStep: without a snapshot of the old b, neither its delete nor the create runs.
        calls, warnings = self.plan("↓a [steps.SimpleStep-1]: \n  expression: a\n↓b [steps.IfStep-2]: \n  condition: x\n", tree_get)
        self.assertEqual(calls, [])
        self.assertTrue(any("'b' not deleted nor replaced" in w for w in warnings))

    def test_no_replacement_without_its_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            m.SUBFILE_BASE[:] = [Path(tmp)]
            snapshot = {"tree": {"qname": "P.sq:s.st:b", "name": "b", "className": "steps.SimpleStep", "properties": {}}}
            calls, warnings = self.plan("↓a [steps.SimpleStep-1]: \n  expression: a\n↓b [steps.IfStep-2]: 🗏 gone.yaml\n", snapshot)
            self.assertEqual(calls, [])
            self.assertTrue(any("'b' (line 3) not created" in w for w in warnings))


class PaletteFallbackTests(Base):
    def test_removed_property_without_palette_defaults(self) -> None:
        def palette(_args: dict[str, Any], _meta: Any) -> dict[str, Any]:
            raise RuntimeError("palette-describe failed: Palette entry not found")

        def tree_get(args: dict[str, Any], _meta: Any) -> dict[str, Any]:
            assert args["properties"] == "changed"
            return {"tree": {"qname": "P.App.NgxApp", "properties": {"componentScriptContent": "s", "tplProjectName": "tpl"}}}

        client = FakeClient({"palette-describe": palette, "databaseobject-tree-get": tree_get})
        tree = {"qname": "P.App.NgxApp", "className": "ngx.components.ApplicationComponent#ApplicationComponent",
                "properties": {"componentScriptContent": "s", "tplProjectName": "tpl", "comment": ""}}
        _u, warnings, _p = m.compute_updates_for_qname(client, "P.App.NgxApp", {"componentScriptContent": "s"}, runtime_tree=tree)
        self.assertEqual([w for w in warnings if w.startswith(m.NOT_APPLIED)], [
            m.not_applied("P.App.NgxApp: property 'tplProjectName' is not in the YAML (a reload sets its default), but "
                          "palette-describe has no default for ngx.components.ApplicationComponent#ApplicationComponent to set")])
        _u, warnings, _p = m.compute_updates_for_qname(
            client, "P.App.NgxApp", {"componentScriptContent": "s", "tplProjectName": "tpl"}, runtime_tree=tree)
        self.assertEqual([w for w in warnings if w.startswith(m.NOT_APPLIED)], [])


class IonNotSetTests(Base):
    def updates(self, value: Any, studio: Any) -> tuple[dict[str, Any], list[str]]:
        client = FakeClient({"palette-describe": {"propertyHints": [
            {"name": "Value", "type": "com.twinsoft.convertigo.beans.ngx.components.MobileSmartSourceType",
             "defaultValue": json.dumps({"mode": "PLAIN", "value": "not set"})}]}})
        bean = json.dumps({"ionBean": "SelectOption", "Value": value})
        tree = {"qname": "P.App.NgxApp.pg:Page.Opt", "className": "ngx.components.UIDynamicElement#SelectOption",
                "properties": {"Value": studio}}
        updates, warnings, _p = m.compute_updates_for_qname(client, "P.App.NgxApp.pg:Page.Opt", {"beanData": bean}, runtime_tree=tree)
        return updates, warnings

    def test_plain_false_matches_the_not_set_null(self) -> None:
        # tree-get reads the engine's not-set sentinel (plain:false) as null: no update, a warning on what it means.
        updates, warnings = self.updates("plain:false", None)
        self.assertEqual(updates, {})
        self.assertTrue(any("not set" in w and "script:'false'" in w for w in warnings))

    def test_a_real_value_still_differs_from_null(self) -> None:
        updates, _w = self.updates("plain:active", None)
        self.assertEqual(updates, {"Value": {"mode": "PLAIN", "value": "active"}})


class RefreshTests(Base):
    def test_refresh_with_nothing_to_apply_sets_a_value_again(self) -> None:
        def apply(args: dict[str, Any], _meta: Any) -> dict[str, Any]:
            self.assertEqual(args["tree"], {"properties": {"comment": "app"}})
            self.assertTrue(args["triggerMobileBuilder"])
            return {"status": "ok", "mobileBuilder": [{"project": "P", "triggered": True, "message": "updateSourceFiles"}]}

        client = FakeClient({"databaseobject-tree-get": {"tree": {"properties": {"comment": "app"}}},
                             "databaseobject-tree-apply": apply})
        out, warnings = io.StringIO(), []
        with redirect_stdout(out):
            m.regenerate_app_sources(client, "P.Application.NgxApp", warnings)
        self.assertIn("REFRESH: nothing to apply", out.getvalue())
        self.assertEqual(warnings, [])


class UnsettableDefaultTests(Base):
    HINTS = [
        {"name": "xmlSimpleTypeAffectation", "type": "com.twinsoft.convertigo.beans.common.XmlQName",
         "defaultValue": "string{http://www.w3.org/2001/XMLSchema}"},
        {"name": "httpParameters", "type": "com.twinsoft.convertigo.beans.common.XMLVector",
         "defaultValue": "[[Content-Type, application/x-www-form-urlencoded]]"},
    ]

    def updates(self, properties: dict[str, Any], changed: dict[str, Any]) -> list[str]:
        client = FakeClient({"palette-describe": {"propertyHints": self.HINTS},
                             "databaseobject-tree-get": {"tree": {"qname": "P.t", "properties": changed}}})
        tree = {"qname": "P.t", "className": "transactions.HttpTransaction", "properties": properties}
        _u, warnings, _p = m.compute_updates_for_qname(client, "P.t", {}, runtime_tree=tree)
        return [w for w in warnings if w.startswith(m.NOT_APPLIED)]

    def test_values_at_their_default_report_nothing(self) -> None:
        props = {"xmlSimpleTypeAffectation": "string{http://www.w3.org/2001/XMLSchema}",
                 "httpParameters": [["Content-Type", "application/x-www-form-urlencoded"]]}
        self.assertEqual(self.updates(props, {}), [])

    def test_a_removed_unsettable_property_is_not_applied(self) -> None:
        props = {"xmlSimpleTypeAffectation": "custom{urn:x}", "httpParameters": [["Accept", "json"]]}
        warnings = self.updates(props, {"xmlSimpleTypeAffectation": "custom{urn:x}", "httpParameters": [["Accept", "json"]]})
        self.assertEqual(len(warnings), 2)
        self.assertIn("XmlQName", warnings[1])


class SaveTests(Base):
    def project(self, tmp: str) -> Path:
        root = Path(tmp)
        (root / "_c8oProject" / "sequences").mkdir(parents=True)
        (root / "c8oProject.yaml").write_text(
            "↑convertigo: 8.4.0.m006\n↓P [core.Project]: \n  version: 1.0.0\n"
            "  ↓s [sequences.GenericSequence]: 🗏 sequences/s.yaml\n", encoding="utf-8")
        (root / "_c8oProject" / "sequences" / "s.yaml").write_text("↓a [steps.SimpleStep-1]: \n  expression: a\n", encoding="utf-8")
        return root

    def test_studio_project_dir(self) -> None:
        client = FakeClient({"project-js-get": {"path": f"/w/P/js/{m.PROJECT_DIR_PROBE}", "status": "missing"}})
        self.assertEqual(m.studio_project_dir(client, "P"), Path("/w/P"))
        self.assertIsNone(m.studio_project_dir(FakeClient({}), "P"))
        self.assertIsNone(m.studio_project_dir(FakeClient({"project-js-get": {"path": "/elsewhere"}}), "P"))

    def test_a_save_that_does_not_save_exits_2(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = self.project(tmp)
            client = FakeClient({"project-save": {"saved": False, "status": "skipped", "message": "boom"}})
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                self.assertEqual(m.save_keeping_yaml(client, "P", root, []), 2)
            failing = FakeClient({"project-save": lambda a, mt: (_ for _ in ()).throw(RuntimeError("project-save failed: Unknown project"))})
            with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                self.assertEqual(m.save_keeping_yaml(failing, "P", root, []), 2)

    def test_version_bump_is_kept(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = self.project(tmp)

            def save(_args: dict[str, Any], _meta: Any) -> dict[str, Any]:
                path = root / "c8oProject.yaml"
                path.write_text(path.read_text(encoding="utf-8").replace("version: 1.0.0", "version: 1.0.1"), encoding="utf-8")
                return {"saved": True, "versionBumped": True, "previousVersion": "1.0.0", "version": "1.0.1"}

            warnings: list[str] = []
            with redirect_stdout(io.StringIO()):
                self.assertIsNone(m.save_keeping_yaml(FakeClient({"project-save": save}), "P", root, warnings))
            self.assertEqual(warnings, [])
            self.assertIn("version: 1.0.1", (root / "c8oProject.yaml").read_text(encoding="utf-8"))

    def test_a_deleted_file_is_put_back(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = self.project(tmp)
            seq = root / "_c8oProject" / "sequences" / "s.yaml"
            orphan = root / "_c8oProject" / "sequences" / "orphan.yaml"
            orphan.write_text("↓o [steps.SimpleStep-1]: \n  expression: o\n", encoding="utf-8")

            def save(_args: dict[str, Any], _meta: Any) -> dict[str, Any]:
                seq.unlink()
                orphan.unlink()
                return {"saved": True}

            warnings: list[str] = []
            with redirect_stdout(io.StringIO()):
                self.assertIsNone(m.save_keeping_yaml(FakeClient({"project-save": save}), "P", root, warnings))
            self.assertTrue(seq.exists() and orphan.exists())
            self.assertEqual(len([w for w in warnings if w.startswith(m.NOT_APPLIED)]), 1)
            self.assertEqual(len(warnings), 2)


class EntryTests(Base):
    def test_non_utf8_yaml_is_read_like_the_engine(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "s.yaml"
            path.write_bytes("↓a [steps.SimpleStep-1]: \n  expression: caf".encode("utf-8") + b"\xe9\n")
            root, _w = m.parse_yaml_tree(path)
            self.assertEqual(root.children[0].scalar_props["expression"], "caf\ufffd")

    def test_an_unexpected_error_exits_2(self) -> None:
        original = m.run
        m.run = lambda argv: (_ for _ in ()).throw(ValueError("boom"))
        try:
            with redirect_stderr(io.StringIO()):
                self.assertEqual(m.main([]), 2)
        finally:
            m.run = original


class ClientTests(Base):
    def test_tool_error_raises(self) -> None:
        client = m.McpClient("http://localhost/mcp", "2025-06-18", 5, token="secret-token")
        client._rpc = lambda method, params, with_protocol: {"result": {"isError": True, "content": [
            {"type": "text", "text": json.dumps({"message": "Unknown project: P (secret-token)"})}]}}
        with self.assertRaises(RuntimeError) as caught:
            client.tool_call("project-save", {"project": "P"})
        self.assertIn("Unknown project", str(caught.exception))
        self.assertNotIn("secret-token", str(caught.exception))

    def test_token_is_not_redirected_nor_printed(self) -> None:
        seen: list[urllib.request.Request] = []

        class Answer(io.BytesIO):
            headers: dict[str, str] = {}

            def __enter__(self) -> "Answer":
                return self

            def __exit__(self, *exc: Any) -> None:
                return None

        def fake_urlopen(req: urllib.request.Request, timeout: float = 0) -> Answer:
            seen.append(req)
            return Answer(b"not json, secret-token")

        original = urllib.request.urlopen
        urllib.request.urlopen = fake_urlopen  # type: ignore[assignment]
        try:
            client = m.McpClient("http://localhost/mcp", "2025-06-18", 5, token="secret-token")
            with self.assertRaises(RuntimeError) as caught:
                client.tool_call("project-list", {})
        finally:
            urllib.request.urlopen = original  # type: ignore[assignment]
        self.assertNotIn("Authorization", seen[0].headers)
        self.assertEqual(seen[0].unredirected_hdrs.get("Authorization"), "Bearer secret-token")
        self.assertNotIn("secret-token", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
