#!/usr/bin/env python3
"""Offline tests of tests/scripts/score_campaign.py: the proofs of a save, a run and a frontend weigh the same on
every Convertigo MCP server, and the score of a run on the Convertigo MCP is unchanged (standard library only,
synthetic campaign).

    python3 tests/scripts/test_score_campaign.py
"""

from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve().parent / "score_campaign.py"
sys.path.insert(0, str(SCRIPT.parent))
import score_campaign as s  # noqa: E402


def call(server: str, name: str, status: str = "success") -> dict[str, Any]:
    return {"server": server, "name": name, "status": status, "durationMs": 1000}


LEGACY_CALLS = [
    call("convertigo", "databaseobject-tree-get"),
    call("convertigo", "databaseobject-tree-apply"),
    call("convertigo", "requestable-execute", "failed"),
    call("convertigo", "requestable-execute"),
    call("convertigo", "requestable-execute"),
    call("convertigo", "project-save"),
    call("convertigo", "mobile-builder-open"),
]
# The same work on a Convertigo MCP server that relays the tree read, with its own authoring, runs and promotion,
# and a check in a browser.
RELAY_CALLS = [
    call("convertigo-flow", "databaseobject-tree-get"),
    call("convertigo-flow", "code-set"),
    call("convertigo-flow", "code-run", "failed"),
    call("convertigo-flow", "code-run"),
    call("convertigo-flow", "flow-test"),
    call("convertigo-flow", "code-promote"),
    call("playwright", "browser_navigate"),
]


def report(calls: list[dict[str, Any]], text: str = "Changed objects listed.", sections: list[str] | None = None) -> dict[str, Any]:
    return {
        "provider": "openai",
        "model": "test-model",
        "durationMs": 300000,
        "result": {"status": "PASS", "success": True, "reason": None},
        "toolCalls": calls,
        "toolStats": {"totalToolCalls": len(calls), "byServer": {}, "byTool": {}, "ragCalls": 0},
        "finalOutput": {"rawText": text, "sectionNames": sections or ["Changed Objects"], "sections": {},
                        "mcpCritique": "The palette answer could list the required properties first."},
    }


def scenario(scenario_id: str, tools: list[str], evidence: bool) -> dict[str, Any]:
    gates = [{"id": "run-result-pass", "type": "runStatus", "expected": "PASS"},
             {"id": "required-tool-calls", "type": "requiredToolCalls", "tools": tools}]
    if evidence:
        gates += [{"id": "runtime-evidence", "type": "runtimeEvidence"}, {"id": "save-evidence", "type": "saveEvidence"}]
    return {
        "scenarioId": scenario_id, "allowedSkipReasons": [], "requiredResultStatus": "PASS", "scenarioWeight": 1,
        "toolCallSoftLimit": 5, "toolCallHardLimit": 15, "durationSoftLimitMs": 240000, "durationHardLimitMs": 720000,
        "scoreWeights": {"taskSuccess": 40, "runtimeEvidenceQuality": 20, "contractPreservation": 15, "toolEfficiency": 10,
                         "latency": 5, "guidanceCompliance": 5, "mcpCritiqueQuality": 5},
        "gateChecks": gates,
    }


SUITE = {"suiteId": "test-suite", "scenarios": [
    scenario("backend-v1", ["databaseobject-tree-get", "requestable-execute", "project-save"], True),
    scenario("frontend-v1", ["databaseobject-tree-get", "mobile-builder-open"], False),
]}


class ProofTests(unittest.TestCase):
    def test_proofs_of_every_server_weigh_the_same(self) -> None:
        legacy, flow = report(LEGACY_CALLS), report(RELAY_CALLS)
        for item in SUITE["scenarios"]:
            for gate in item["gateChecks"]:
                with self.subTest(scenario=item["scenarioId"], gate=gate["id"]):
                    self.assertTrue(s.evaluate_gate(gate, item, legacy, None, {}))
                    self.assertTrue(s.evaluate_gate(gate, item, flow, None, {}))
        self.assertEqual(s.runtime_score(legacy), 100.0)
        self.assertEqual(s.runtime_score(flow), 100.0)

    def test_proofs_that_do_not_count(self) -> None:
        tools = [call("convertigo-flow", "code-set"), call("convertigo-flow", "code-run", "failed"),
                 call("playwright", "browser_navigate"), call("convertigo-flow", "code-promote", "failed")]
        failed = report(tools)
        self.assertFalse(s.has_save_evidence(failed))
        self.assertFalse(s.has_runtime_evidence(failed))
        self.assertEqual(s.runtime_score(failed), 0.0)
        gate = {"type": "requiredToolCalls", "tools": ["requestable-execute"]}
        self.assertFalse(s.evaluate_gate(gate, {}, report([call("playwright", "browser_navigate")]), None, {}))
        self.assertEqual(s.runtime_score(report([call("convertigo-flow", "code-run")])), 75.0)
        self.assertTrue(s.has_save_evidence(report([], text="Promoted with code-promote, revision 4.")))


class CampaignTests(unittest.TestCase):
    def score(self, calls: list[dict[str, Any]]) -> dict[str, Any]:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            runs = []
            for item in SUITE["scenarios"]:
                path = root / "runs" / item["scenarioId"] / "report.json"
                path.parent.mkdir(parents=True)
                path.write_text(json.dumps(report(copy.deepcopy(calls))), encoding="utf-8")
                runs.append({"scenarioId": item["scenarioId"], "runId": item["scenarioId"] + "_1", "reportPath": str(path)})
            (root / "manifest.json").write_text(json.dumps({"candidateId": "test", "suiteId": "test-suite", "runs": runs}))
            (root / "suite.json").write_text(json.dumps(SUITE))
            subprocess.run([sys.executable, "-B", str(SCRIPT), "--campaign-dir", str(root), "--suite", str(root / "suite.json")],
                           check=True, stdout=subprocess.DEVNULL)
            findings = json.loads((root / "aggregate" / "findings.json").read_text(encoding="utf-8"))
        for item in findings["scenarioResults"]:
            del item["runReportPath"]
        return findings

    def test_legacy_score_is_unchanged_and_the_same_work_scores_the_same(self) -> None:
        legacy = self.score(LEGACY_CALLS)
        # The score of the first score_campaign.py on this campaign.
        self.assertEqual((legacy["overallScore"], legacy["passCount"], legacy["failCount"]), (87.88, 2, 0))
        self.assertEqual([item["score"] for item in legacy["scenarioResults"]], [87.88, 87.88])
        flow = self.score(RELAY_CALLS)
        self.assertEqual(flow["scenarioResults"], legacy["scenarioResults"])
        self.assertEqual(flow["overallScore"], legacy["overallScore"])


if __name__ == "__main__":
    unittest.main()
