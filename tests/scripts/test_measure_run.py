#!/usr/bin/env python3
"""Offline tests of tests/scripts/measure_run.py: the measures of a run on the Convertigo MCP stay those of the first
version, every Convertigo MCP server is counted, and a Claude Code run and a Codex run of the same calls measure the
same; measure_vibe.py counts every Convertigo MCP server too (standard library only, synthetic transcripts).

    python3 tests/scripts/test_measure_run.py
"""

from __future__ import annotations

import datetime
import gzip
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import measure_run as m  # noqa: E402
import measure_vibe  # noqa: E402

START = datetime.datetime(2026, 1, 5, 9, 0, tzinfo=datetime.timezone.utc)


def at(seconds: float) -> str:
    return (START + datetime.timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")


# Claude Code records.

def assistant(seconds: float, message_id: str, *blocks: dict[str, Any], usage: dict[str, int] | None = None) -> dict[str, Any]:
    return {"type": "assistant", "timestamp": at(seconds),
            "message": {"id": message_id, "role": "assistant", "content": list(blocks), "usage": usage or {}}}


def tool_use(call_id: str, name: str, **arguments: Any) -> dict[str, Any]:
    return {"type": "tool_use", "id": call_id, "name": name, "input": arguments}


def tool_result(seconds: float, call_id: str, error: bool = False) -> dict[str, Any]:
    return {"type": "user", "timestamp": at(seconds), "message": {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": call_id, "content": "redacted", "is_error": error}]}}


def text(seconds: float, message_id: str, usage: dict[str, int]) -> dict[str, Any]:
    return assistant(seconds, message_id, {"type": "text", "text": "redacted"}, usage=usage)


USAGE = {"input_tokens": 10, "output_tokens": 50, "cache_read_input_tokens": 900, "cache_creation_input_tokens": 40}


def legacy_transcript() -> list[Any]:
    """A run on the Convertigo MCP alone: one message in two records, parallel calls, failures, a pause."""
    return [
        {"type": "summary", "summary": "redacted"},
        text(0, "m1", USAGE),
        assistant(1, "m1", tool_use("t1", "mcp__convertigo__project-list"), usage=USAGE),
        tool_result(3, "t1"),
        assistant(4, "m2", tool_use("t2", "mcp__convertigo__databaseobject-tree-apply"), usage=USAGE),
        assistant(4, "m2", tool_use("t3", "Bash", command="npx playwright test"), usage=USAGE),
        tool_result(10, "t2", error=True),
        tool_result(12, "t3"),
        assistant(20, "m3", tool_use("t4", "ReadMcpResourceTool", server="convertigo", uri="guide://start"), usage=USAGE),
        tool_result(21, "t4"),
        "not a record",
        assistant(1000, "m4", tool_use("t5", "mcp__playwright__browser_navigate", url="http://localhost"), usage=USAGE),
        tool_result(1005, "t5", error=True),
        assistant(1006, "m5", tool_use("t6", "mcp__convertigo__project-save"), tool_use("t7", "mcp__convertigo__project-list"),
                  usage=USAGE),
        tool_result(1010, "t6"),
        tool_result(1010, "t7"),
        text(1011, "m6", USAGE),
    ]


# The measures of the first measure_run.py on legacy_transcript(), first and last apart (local time zone).
LEGACY_MEASURES = {
    "transcripts": 1,
    "active_minutes": 0.5,
    "requests": 6,
    "tool_calls": 7,
    "tool_failures": 2,
    "mcp_calls": 4,
    "bash_calls": 1,
    "resource_reads": 1,
    "input_tokens": 60,
    "output_tokens": 300,
    "cache_read_tokens": 5400,
    "cache_write_tokens": 240,
    "top_mcp_tools": {"project-list": 2, "databaseobject-tree-apply": 1, "project-save": 1},
    "top_tools": {"mcp__convertigo__project-list": 2, "mcp__convertigo__databaseobject-tree-apply": 1, "Bash": 1,
                  "ReadMcpResourceTool": 1, "mcp__playwright__browser_navigate": 1, "mcp__convertigo__project-save": 1},
    "failures_by_tool": {"mcp__convertigo__databaseobject-tree-apply": 1, "mcp__playwright__browser_navigate": 1},
}


def claude_run(server: str = "convertigo-flow") -> list[Any]:
    """The same calls as codex_run() and codex_items_run(): authoring, a failed run, a relayed save, a resource, a
    direct call on the Convertigo MCP, two shell commands, a browser check."""
    mcp = "mcp__" + server + "__"
    return [
        assistant(0, "r1", tool_use("a", mcp + "code-set"), usage=USAGE),
        tool_result(2, "a"),
        assistant(3, "r2", tool_use("b", mcp + "code-run"), tool_use("c", mcp + "project-save"), usage=USAGE),
        tool_result(4, "b", error=True),
        tool_result(6, "c"),
        assistant(7, "r3", tool_use("d", "ReadMcpResourceTool", server=server, uri="guide://start"),
                  tool_use("e", "mcp__convertigo__project-list"), usage=USAGE),
        tool_result(8, "d"),
        tool_result(8, "e"),
        assistant(9, "r4", tool_use("f", "Bash", command="ls"), tool_use("g", "Bash", command="false"), usage=USAGE),
        tool_result(10, "f"),
        tool_result(10, "g", error=True),
        assistant(11, "r5", tool_use("h", "mcp__playwright__browser_navigate"), usage=USAGE),
        tool_result(14, "h"),
    ]


# Codex records.

def codex(seconds: float, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {"timestamp": at(seconds), "type": kind, "payload": payload}


def cell(seconds: float, call_id: str) -> dict[str, Any]:
    return codex(seconds, "response_item", {"type": "custom_tool_call", "call_id": call_id, "name": "exec", "input": "redacted"})


def mcp_end(seconds: float, server: str, tool: str, duration: float, error: str | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {"Err": "redacted"} if error == "err" else {
        "Ok": {"content": [{"type": "text", "text": "redacted"}], "isError": error == "isError"}}
    return codex(seconds, "event_msg", {"type": "mcp_tool_call_end", "call_id": "n%s" % seconds,
                                        "invocation": {"server": server, "tool": tool, "arguments": {}},
                                        "duration": {"secs": int(duration), "nanos": int(duration % 1 * 1e9)},
                                        "result": result})


def shell_end(seconds: float, call_id: str, command: str, exit_code: int, duration: float) -> dict[str, Any]:
    return codex(seconds, "event_msg", {"type": "exec_command_end", "call_id": call_id,
                                        "command": ["bash", "-lc", command], "exit_code": exit_code,
                                        "duration": {"secs": int(duration), "nanos": 0}})


def tokens(seconds: float, total: int) -> dict[str, Any]:
    last = {"input_tokens": 910, "cached_input_tokens": 900, "cache_write_input_tokens": 40, "output_tokens": 50}
    return codex(seconds, "event_msg", {"type": "token_count", "info": {
        "total_token_usage": {key: value * total for key, value in last.items()}, "last_token_usage": last}})


def codex_run(server: str = "convertigo-flow") -> list[dict[str, Any]]:
    """claude_run() made by Codex in code cells: the end events of the calls, token counts repeated."""
    return [
        codex(0, "session_meta", {"id": "redacted", "cli_version": "0.0.0"}),
        cell(0, "x1"), mcp_end(2, server, "code-set", 2), tokens(2, 1), tokens(2, 1),
        cell(3, "x2"), mcp_end(4, server, "code-run", 1, error="isError"), mcp_end(6, server, "project-save", 3), tokens(6, 2),
        cell(7, "x3"), mcp_end(8, server, "read_mcp_resource", 1), mcp_end(8, "convertigo", "project-list", 1), tokens(8, 3),
        codex(9, "response_item", {"type": "function_call", "call_id": "sh1", "name": "exec_command", "arguments": "{}"}),
        shell_end(10, "sh1", "ls", 0, 1),
        codex(9, "response_item", {"type": "function_call", "call_id": "sh2", "name": "exec_command", "arguments": "{}"}),
        shell_end(10, "sh2", "false", 1, 1), tokens(10, 4),
        cell(11, "x4"), mcp_end(14, "playwright", "browser_navigate", 3), tokens(14, 5),
    ]


def item(seconds: float, item_id: str, item_type: str, duration: float, **fields: Any) -> dict[str, Any]:
    return codex(seconds, "event_msg", {"type": "item_completed", "item": dict(
        {"id": item_id, "type": item_type, "duration": {"secs": int(duration), "nanos": 0}}, **fields)})


def codex_items_run(server: str = "convertigo-flow") -> list[dict[str, Any]]:
    """claude_run() in the completed items of a Codex rollout; a direct call and its item are one call."""
    return [
        codex(0, "session_meta", {"id": "redacted"}),
        cell(0, "x1"), item(2, "exec-1", "McpToolCall", 2, server=server, tool="code-set", status="completed"),
        item(2, "r", "Reasoning", 0), tokens(2, 1),
        cell(3, "x2"), item(4, "exec-2", "McpToolCall", 1, server=server, tool="code-run", status="failed"),
        item(6, "exec-3", "McpToolCall", 3, server=server, tool="project-save", status="completed"), tokens(6, 2),
        codex(7, "response_item", {"type": "function_call", "call_id": "call_r", "namespace": "mcp__" + server,
                                   "name": "read_mcp_resource", "arguments": "{}"}),
        item(8, "call_r", "McpToolCall", 1, server=server, tool="read_mcp_resource", status="completed"),
        item(8, "exec-4", "McpToolCall", 1, server="convertigo", tool="project-list", status="completed"), tokens(8, 3),
        cell(9, "x3"), item(10, "exec-5", "CommandExecution", 1, command="ls", exit_code=0, status="completed"),
        item(10, "exec-6", "CommandExecution", 1, command="false", exit_code=1, status="failed"), tokens(10, 4),
        item(10, "subagent-1", "SubAgentActivity", 0, kind="completed"),
        cell(11, "x4"), item(14, "exec-7", "McpToolCall", 3, server="playwright", tool="browser_navigate", status="completed"),
        tokens(14, 5),
    ]


COMPARED = ("requests", "tool_calls", "tool_failures", "mcp_calls", "mcp_failures", "bash_calls", "bash_failures",
            "resource_reads", "relayed_mcp_calls", "relayed_tools", "browser_calls", "browser_failures",
            "playwright_calls", "top_mcp_tools", "convertigo_servers", "input_tokens", "output_tokens",
            "cache_read_tokens", "cache_write_tokens", "tool_seconds", "mcp_seconds", "bash_seconds", "browser_seconds")


class Base(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)

    def write(self, name: str, records: list[Any]) -> Path:
        path = Path(self.folder.name) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        body = "".join((record if isinstance(record, str) else json.dumps(record)) + "\n" for record in records)
        if name.endswith(".gz"):
            with gzip.open(path, "wt", encoding="utf-8") as handle:
                handle.write(body)
        else:
            path.write_text(body, encoding="utf-8")
        return path

    def measure(self, *paths: Path, servers: tuple[str, ...] = ()) -> dict[str, Any]:
        return m.measure(m.transcripts([str(path) for path in paths]), servers)


class LegacyTests(Base):
    def test_measures_of_a_legacy_run_are_unchanged(self) -> None:
        measures = self.measure(self.write("legacy.jsonl", legacy_transcript()))
        # Same values, same order of keys and of tools (ties included).
        self.assertEqual(json.dumps({key: measures[key] for key in LEGACY_MEASURES}), json.dumps(LEGACY_MEASURES))
        self.assertEqual(measures["first"], START.astimezone().isoformat(timespec="minutes"))
        self.assertEqual(measures["last"], (START + datetime.timedelta(seconds=1011)).astimezone().isoformat(timespec="minutes"))
        keys = list(LEGACY_MEASURES)
        self.assertEqual(list(measures)[:len(keys) + 2], keys[:1] + ["first", "last"] + keys[1:])

    def test_a_legacy_run_has_one_server_and_no_relay(self) -> None:
        measures = self.measure(self.write("legacy.jsonl", legacy_transcript()))
        self.assertEqual(measures["convertigo_servers"], ["convertigo"])
        self.assertEqual(measures["relayed_mcp_calls"], 0)
        server = measures["mcp_servers"]["convertigo"]
        self.assertEqual((server["calls"], server["failures"], server["resource_reads"], server["relays"]), (4, 1, 1, False))
        self.assertEqual(server["tool_seconds"], 2 + 6 + 4 + 4)
        self.assertFalse(measures["mcp_servers"]["playwright"]["convertigo"])
        self.assertEqual((measures["browser_calls"], measures["browser_failures"], measures["playwright_calls"]), (1, 1, 2))
        self.assertEqual((measures["bash_failures"], measures["bash_seconds"]), (0, 8))

    def test_folders_and_gzipped_transcripts(self) -> None:
        self.write("home/projects/p/legacy.jsonl.gz", legacy_transcript())
        measures = self.measure(Path(self.folder.name) / "home")
        self.assertEqual({key: measures[key] for key in LEGACY_MEASURES}, LEGACY_MEASURES)
        self.assertEqual(measures["agents"], {"claude": 1})


class ServerTests(Base):
    def test_every_convertigo_server_is_counted_and_relayed_tools_are_attributed(self) -> None:
        measures = self.measure(self.write("flow.jsonl", claude_run()))
        self.assertEqual(measures["convertigo_servers"], ["convertigo", "convertigo-flow"])
        self.assertEqual(measures["mcp_calls"], 4)
        self.assertEqual(measures["mcp_failures"], 1)
        self.assertEqual(measures["top_mcp_tools"], {"code-set": 1, "code-run": 1, "project-save": 1, "project-list": 1})
        self.assertEqual((measures["relayed_mcp_calls"], measures["relayed_tools"]), (1, {"project-save": 1}))
        flow = measures["mcp_servers"]["convertigo-flow"]
        self.assertEqual((flow["calls"], flow["failures"], flow["relayed_calls"], flow["resource_reads"], flow["relays"]),
                         (3, 1, 1, 1, True))
        legacy = measures["mcp_servers"]["convertigo"]
        self.assertEqual((legacy["calls"], legacy["relayed_calls"], legacy["relays"]), (1, 0, False))

    def test_servers_are_recognised_by_name_tools_or_option(self) -> None:
        records = [
            assistant(0, "r1", tool_use("a", "mcp__studio__databaseobject-tree-get"), tool_use("b", "mcp__c8o_dev__ping"),
                      tool_use("c", "mcp__local__project-list"), tool_use("d", "mcp__plugin_x_Convertigo__tags-get")),
        ]
        path = self.write("servers.jsonl", records)
        self.assertEqual(self.measure(path)["convertigo_servers"], ["c8o_dev", "plugin_x_Convertigo", "studio"])
        self.assertEqual(self.measure(path, servers=("local",))["mcp_calls"], 4)


class CodexTests(Base):
    def test_a_codex_run_measures_like_the_same_claude_run(self) -> None:
        claude = self.measure(self.write("claude.jsonl", claude_run()))
        for name, records in (("events.jsonl", codex_run()), ("items.jsonl", codex_items_run())):
            with self.subTest(name):
                measures = self.measure(self.write(name, records))
                self.assertEqual({key: measures[key] for key in COMPARED}, {key: claude[key] for key in COMPARED})
                self.assertEqual(measures["agents"], {"codex": 1})
                self.assertEqual(measures["code_cells"], 4)
                for server in ("convertigo", "convertigo-flow", "playwright"):
                    self.assertEqual(measures["mcp_servers"][server], claude["mcp_servers"][server])

    def test_tokens_of_a_codex_request(self) -> None:
        measures = self.measure(self.write("events.jsonl", codex_run()))
        self.assertEqual(measures["requests"], 5)
        self.assertEqual((measures["input_tokens"], measures["cache_read_tokens"]), (5 * 10, 5 * 900))

    def test_mcp_errors_and_calls_without_events(self) -> None:
        records = [
            codex(0, "session_meta", {"id": "redacted"}),
            cell(0, "x1"), mcp_end(1, "convertigo", "requestable-execute", 1, error="err"),
            codex(2, "response_item", {"type": "function_call", "call_id": "w", "name": "wait", "arguments": "{}"}),
            codex(3, "response_item", {"type": "function_call_output", "call_id": "w", "output": "exit code: 1"}),
        ]
        measures = self.measure(self.write("errors.jsonl", records))
        self.assertEqual((measures["mcp_calls"], measures["mcp_failures"], measures["tool_calls"]), (1, 1, 2))
        self.assertEqual(measures["failures_by_tool"], {"mcp__convertigo__requestable-execute": 1})

        records = [
            codex(0, "response_item", {"type": "function_call", "call_id": "a", "name": "mcp__convertigo__project-save",
                                       "arguments": "{}"}),
            codex(1, "response_item", {"type": "function_call_output", "call_id": "a", "output": "redacted"}),
            codex(2, "response_item", {"type": "function_call", "call_id": "b", "name": "exec_command",
                                       "arguments": "{\"cmd\": \"npx playwright test\"}"}),
            codex(4, "response_item", {"type": "function_call_output", "call_id": "b", "output": "Exit code: 2\nredacted"}),
        ]
        measures = self.measure(self.write("calls.jsonl", records))
        self.assertEqual((measures["mcp_calls"], measures["bash_calls"], measures["bash_failures"]), (1, 1, 1))
        self.assertEqual((measures["playwright_calls"], measures["bash_seconds"], measures["mcp_seconds"]), (1, 2, 1))


class VibeTests(Base):
    def test_every_convertigo_server_of_a_vibe_journal(self) -> None:
        records = []
        for index, (group, name, result) in enumerate([
                ("mcp_Convertigo", "project_list", "tool_succeeded"), ("mcp_Convertigo", "project_save", "tool_failed"),
                ("mcp_convertigo_flow", "code_set", "tool_succeeded"), ("mcp_playwright", "browser_navigate", "tool_succeeded"),
                (None, "file_system.bash", "tool_succeeded")]):
            call = {"name": name, "group_name": group} if group else {"name": name}
            records.append({"type": "action_intent", "time_unix_ms": 1767600000000 + index * 1000,
                            "payload": {"kind": "tool", "action_id": str(index), "request": {"call": call}}})
            records.append({"type": "action_result", "payload": {"action_id": str(index), "result": {"type": result}}})
        self.write("session/journal/0001.jsonl", records)
        measures = measure_vibe.measure(measure_vibe.journals([str(Path(self.folder.name) / "session")]))
        self.assertEqual((measures["tool_calls"], measures["tool_failures"], measures["bash_calls"]), (5, 1, 1))
        self.assertEqual(measures["convertigo_calls"], 3)
        self.assertEqual(measures["convertigo_calls_by_server"], {"mcp_Convertigo": 2, "mcp_convertigo_flow": 1})


if __name__ == "__main__":
    unittest.main()
