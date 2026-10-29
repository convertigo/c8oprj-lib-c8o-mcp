#!/usr/bin/env python3
"""Measures an agent run from its transcripts: Claude Code (projects/<dir>/<session>.jsonl of a Claude home) or Codex
(sessions/**/rollout-*.jsonl of a Codex home), plain or gzipped. The same rules apply to both agents.

Active time is the sum of the gaps under 10 minutes between records, so a run left waiting does not count. A model
request is one assistant message id (Claude Code writes one record per content block of the same message) or one
update of the Codex token count. Input tokens are the input tokens not read from the cache.

A tool call is a call made by the agent: a Claude Code tool_use, or a Codex tool call. The calls made by a Codex code
cell (exec) count one by one, and the cells are counted apart (code_cells). Codex calls take the Claude Code names:
mcp__<server>__<tool> for an MCP tool, Bash for a shell command, ReadMcpResourceTool for an MCP resource read. A
failure is a result flagged as an error: is_error, an MCP error, a failed status or a non-zero exit code. The time of
a call runs from the call to its result; calls made in parallel each count their own time.

Convertigo MCP calls are the calls of every Convertigo MCP server: a server whose name contains convertigo or c8o, a
server named by --server, or a server that calls Convertigo tools (databaseobject-*, requestable-*, flow-*, ...).
They are counted per server (mcp_servers) and in total (mcp_calls). A Convertigo server with tools of its own
(flow-*, code-*, ...) relays tools of the Convertigo MCP under their names: these calls count as calls of the tool
they relay (top_mcp_tools) and as relayed calls of their server. Browser calls are the calls of a browser MCP server
(Playwright, Chrome, ...); Playwright calls add the Bash commands that run Playwright.

    python3 measure_run.py [--server NAME] <transcript.jsonl[.gz] | Claude or Codex home | folder> [...]
"""
import argparse
import collections
import datetime
import gzip
import json
import re
import sys
from pathlib import Path

GAP_SECONDS = 600
CONVERTIGO_SERVER_MARKERS = ("convertigo", "c8o")
CONVERTIGO_TOOL_PREFIXES = ("databaseobject-", "requestable-", "mobile-builder-", "nocode-", "palette-", "scheduler-",
                            "marketplace-", "flow-", "frontend-svelte-")
RELAYING_TOOL_PREFIXES = ("flow-", "code-", "frontend-svelte-", "authoring-")
# The tools of the Convertigo MCP that a Convertigo server with tools of its own relays under the same names.
RELAYED_TOOLS = frozenset((
    "databaseobject-schema", "databaseobject-search", "databaseobject-tree-get", "image-describe", "log-view",
    "marketplace-describe", "marketplace-import", "marketplace-list", "project-list", "project-list-symbols",
    "project-save", "project-security-audit", "rag-query", "requestable-execute", "scheduler-apply", "scheduler-list",
))
BROWSER_SERVER_MARKERS = ("playwright", "browser", "chrome", "puppeteer", "devtools")
RESOURCE_TOOLS = {"read_mcp_resource": "ReadMcpResourceTool", "list_mcp_resources": "ListMcpResourcesTool",
                  "list_mcp_resource_templates": "ListMcpResourcesTool"}
SHELL_TOOLS = ("exec_command", "shell", "shell_command", "local_shell", "container.exec")
CODEX_TOOL_CALLS = ("function_call", "custom_tool_call", "local_shell_call", "web_search_call", "tool_search_call")
CODEX_TOOL_ENDS = ("mcp_tool_call_end", "exec_command_end", "patch_apply_end")
CODEX_ITEM_NAMES = {"CommandExecution": "Bash", "FileChange": "apply_patch", "ImageView": "view_image",
                    "WebSearch": "web_search"}
CODEX_NOT_CALLS = ("Reasoning", "AgentMessage", "UserMessage", "ContextCompaction", "FunctionCallOutput")
EXIT_CODE_RE = re.compile(r"(?:exit code|exited with code):?\s*(-?\d+)", re.IGNORECASE)


def transcripts(paths):
    files = []
    for raw in paths:
        path = Path(raw).expanduser()
        if path.is_dir():
            files += sorted(path.glob("**/*.jsonl")) + sorted(path.glob("**/*.jsonl.gz"))
        elif path.is_file():
            files.append(path)
        else:
            sys.exit("not found: " + raw)
    return files


def timestamp(text):
    return datetime.datetime.fromisoformat(text.replace("Z", "+00:00"))


def lines(file):
    if file.name.endswith(".gz"):
        return gzip.open(file, "rt", encoding="utf-8")
    return file.open(encoding="utf-8")


def split_mcp(name):
    """(server, tool) of a tool named mcp__<server>__<tool>, else (None, None)."""
    if not name.startswith("mcp__"):
        return None, None
    server, separator, tool = name[len("mcp__"):].partition("__")
    return (server, tool) if separator and server and tool else (None, None)


def model_name(payload):
    """The name of a Codex tool call that is neither an MCP call nor a shell command."""
    name = payload.get("name") or str(payload.get("type") or "?").replace("_call", "")
    return payload["namespace"] + "." + name if payload.get("namespace") else name


def seconds_of(value):
    if isinstance(value, dict) and ("secs" in value or "nanos" in value):
        return (value.get("secs") or 0) + (value.get("nanos") or 0) / 1e9
    return None


class Run:
    """The counts of every transcript of a run, under Claude Code tool names."""

    def __init__(self):
        self.times = []
        self.usage_by_request = {}
        self.tools = collections.Counter()
        self.failures = collections.Counter()
        self.seconds = collections.Counter()
        self.resource_reads = collections.Counter()
        self.playwright_commands = 0
        self.code_cells = 0
        self.agents = collections.Counter()
        self.names = {}
        self.started = {}

    def call(self, name, failed=False, seconds=None, server=None, command=None):
        self.tools[name] += 1
        if failed:
            self.failures[name] += 1
        if seconds is not None and seconds >= 0:
            self.seconds[name] += seconds
        if name == "ReadMcpResourceTool":
            self.resource_reads[server or "?"] += 1
        if name == "Bash" and "playwright" in str(command or "").lower():
            self.playwright_commands += 1

    def claude(self, record, when):
        """A Claude Code record: tool_use blocks of assistant messages, tool_result blocks of user messages."""
        message = record.get("message") or {}
        content = message.get("content") if isinstance(message.get("content"), list) else []
        if record.get("type") == "assistant":
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    name = block.get("name", "?")
                    arguments = block.get("input") if isinstance(block.get("input"), dict) else {}
                    self.call(name, server=arguments.get("server"), command=arguments.get("command"))
                    self.names[block.get("id")] = name
                    self.started[block.get("id")] = when
            if message.get("id"):
                self.usage_by_request[message["id"]] = message.get("usage") or {}
            return True
        if record.get("type") == "user":
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_result":
                    name = self.names.get(block.get("tool_use_id"), "?")
                    if block.get("is_error"):
                        self.failures[name] += 1
                    started = self.started.pop(block.get("tool_use_id"), None)
                    if started and when:
                        self.seconds[name] += max(0.0, (when - started).total_seconds())
            return True
        return False


class CodexFile:
    """The records of one Codex rollout. Tool calls come from its completed items, else from its end events (MCP,
    shell, patch); the model calls they do not cover count on their own."""

    def __init__(self, run, key):
        self.run = run
        self.key = key
        self.calls = {}
        self.outputs = {}
        self.items = []
        self.ends = []
        self.total = None
        self.seen = False

    def record(self, record, when):
        payload = record.get("payload")
        if not isinstance(payload, dict):
            return
        kind = record.get("type")
        payload_type = payload.get("type")
        if kind == "session_meta":
            self.seen = True
        elif kind == "response_item" and payload_type in CODEX_TOOL_CALLS:
            self.seen = True
            self.calls[payload.get("call_id") or payload.get("id")] = (payload, when)
        elif kind == "response_item" and payload_type in ("function_call_output", "custom_tool_call_output"):
            self.outputs[payload.get("call_id")] = (payload.get("output"), when)
        elif kind == "event_msg" and payload_type == "item_completed":
            item = payload.get("item") if isinstance(payload.get("item"), dict) else {}
            if item.get("type") and item.get("type") not in CODEX_NOT_CALLS:
                self.items.append((item, payload))
        elif kind == "event_msg" and payload_type in CODEX_TOOL_ENDS:
            self.ends.append(payload)
        elif kind == "event_msg" and payload_type == "token_count":
            info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
            total = info.get("total_token_usage")
            if total and total != self.total:
                self.total = total
                usage = info.get("last_token_usage") or {}
                cached = usage.get("cached_input_tokens") or 0
                self.run.usage_by_request[(self.key, len(self.run.usage_by_request))] = {
                    "input_tokens": max(0, (usage.get("input_tokens") or 0) - cached),
                    "output_tokens": usage.get("output_tokens") or 0,
                    "cache_read_input_tokens": cached,
                    "cache_creation_input_tokens": usage.get("cache_write_input_tokens") or 0,
                }

    def mcp(self, server, tool, failed, seconds):
        name = RESOURCE_TOOLS.get(tool) or "mcp__%s__%s" % (server, tool)
        self.run.call(name, failed=failed, seconds=seconds, server=server)

    def close(self):
        covered = set()
        if self.items:
            for item, payload in self.items:
                kind = item.get("type")
                if kind == "SubAgentActivity" and item.get("id") not in self.calls:
                    continue
                covered.add(item.get("id"))
                seconds = seconds_of(item.get("duration"))
                if seconds is None and isinstance(item.get("durationMs"), (int, float)):
                    seconds = item["durationMs"] / 1000
                if seconds is None and payload.get("started_at_ms") and payload.get("completed_at_ms"):
                    seconds = (payload["completed_at_ms"] - payload["started_at_ms"]) / 1000
                result = item.get("result") if isinstance(item.get("result"), dict) else {}
                failed = item.get("status") == "failed" or bool(result.get("isError"))
                if kind == "McpToolCall":
                    self.mcp(item.get("server"), item.get("tool"), failed, seconds)
                    continue
                if kind == "CommandExecution":
                    failed = failed or item.get("exit_code") not in (0, None)
                name = CODEX_ITEM_NAMES.get(kind)
                if kind == "DynamicToolCall":
                    name = model_name({"namespace": item.get("namespace"), "name": item.get("tool") or kind})
                    failed = failed or item.get("success") is False
                elif not name and item.get("id") in self.calls:
                    name = model_name(self.calls[item["id"]][0])
                name = name or str(item.get("kind") or kind)
                self.run.call(name, failed=failed, seconds=seconds, command=item.get("command"))
        else:
            for payload in self.ends:
                covered.add(payload.get("call_id"))
                seconds = seconds_of(payload.get("duration"))
                if payload.get("type") == "mcp_tool_call_end":
                    invocation = payload.get("invocation") or {}
                    result = payload.get("result") if isinstance(payload.get("result"), dict) else {}
                    ok = result.get("Ok") if isinstance(result.get("Ok"), dict) else {}
                    failed = "Err" in result or bool(ok.get("isError"))
                    self.mcp(invocation.get("server"), invocation.get("tool"), failed, seconds)
                elif payload.get("type") == "exec_command_end":
                    command = payload.get("command")
                    command = " ".join(command) if isinstance(command, list) else command
                    self.run.call("Bash", failed=payload.get("exit_code") not in (0, None), seconds=seconds,
                                  command=command)
                else:
                    self.run.call("apply_patch", failed=payload.get("success") is False, seconds=seconds)
        for call_id, (payload, when) in self.calls.items():
            if call_id in covered:
                continue
            name = payload.get("name") or ""
            if payload.get("type") == "custom_tool_call" and name == "exec":
                self.run.code_cells += 1
                continue
            output, done = self.outputs.get(call_id, (None, None))
            seconds = (done - when).total_seconds() if done and when else None
            namespace = payload.get("namespace") or ""
            if payload.get("type") == "local_shell_call" or name in SHELL_TOOLS:
                match = EXIT_CODE_RE.search(output[:500]) if isinstance(output, str) else None
                command = payload.get("arguments") or payload.get("action")
                self.run.call("Bash", failed=bool(match) and match.group(1) != "0", seconds=seconds, command=command)
            elif namespace.startswith("mcp__"):
                self.mcp(namespace[len("mcp__"):], name, False, seconds)
            elif split_mcp(name)[0]:
                self.mcp(*split_mcp(name), False, seconds)
            else:
                self.run.call(model_name(payload), seconds=seconds)
        return self.seen


def read(files):
    run = Run()
    for index, file in enumerate(files):
        codex = CodexFile(run, index)
        claude = False
        with lines(file) as handle:
            for line in handle:
                try:
                    record = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(record, dict):
                    continue
                when = None
                if record.get("timestamp"):
                    when = timestamp(record["timestamp"])
                    run.times.append(when)
                claude = run.claude(record, when) or claude
                codex.record(record, when)
        if codex.close():
            run.agents["codex"] += 1
        elif claude:
            run.agents["claude"] += 1
    return run


def is_convertigo(server, tools, forced):
    lowered = server.lower()
    return (server in forced or any(marker in lowered for marker in CONVERTIGO_SERVER_MARKERS)
            or any(tool.startswith(CONVERTIGO_TOOL_PREFIXES) for tool in tools))


def relays(server, tools):
    return "flow" in server.lower() or any(tool.startswith(RELAYING_TOOL_PREFIXES) for tool in tools)


def is_browser(server):
    return any(marker in server.lower() for marker in BROWSER_SERVER_MARKERS)


def measure(files, servers=()):
    run = read(files)
    tools, failures, seconds = run.tools, run.failures, run.seconds
    times = sorted(run.times)
    active = sum(d for d in ((b - a).total_seconds() for a, b in zip(times, times[1:])) if d < GAP_SECONDS)

    def total(key):
        return sum((usage.get(key) or 0) for usage in run.usage_by_request.values())

    by_server = collections.defaultdict(collections.Counter)
    for name, count in tools.items():
        server, tool = split_mcp(name)
        if server:
            by_server[server][tool] += count
    for server in run.resource_reads:
        by_server.setdefault(server, collections.Counter())
    convertigo = {server for server, calls in by_server.items() if is_convertigo(server, calls, set(servers))}
    relaying = {server for server in convertigo if relays(server, by_server[server])}

    mcp = collections.Counter()
    relayed = collections.Counter()
    stats = {}
    for name, count in tools.items():
        server, tool = split_mcp(name)
        if not server:
            continue
        entry = stats.setdefault(server, {"convertigo": server in convertigo, "relays": server in relaying, "calls": 0,
                                          "failures": 0, "relayed_calls": 0, "resource_reads": 0, "tool_seconds": 0.0})
        entry["calls"] += count
        entry["failures"] += failures.get(name, 0)
        entry["tool_seconds"] += seconds.get(name, 0.0)
        if server in convertigo:
            mcp[tool] += count
            if server in relaying and tool in RELAYED_TOOLS:
                relayed[tool] += count
                entry["relayed_calls"] += count
    for server, reads in run.resource_reads.items():
        stats.setdefault(server, {"convertigo": server in convertigo, "relays": server in relaying, "calls": 0,
                                  "failures": 0, "relayed_calls": 0, "resource_reads": 0, "tool_seconds": 0.0})
        stats[server]["resource_reads"] = reads
    for server, entry in stats.items():
        entry["tool_seconds"] = round(entry["tool_seconds"], 1)
        entry["top_tools"] = dict(by_server[server].most_common(12))

    def summed(servers_of, counter):
        return sum(value for name, value in counter.items() if split_mcp(name)[0] in servers_of)

    browsers = {server for server in by_server if server not in convertigo and is_browser(server)}
    playwright = {server for server in browsers if "playwright" in server.lower()}
    return {
        "transcripts": len(files),
        "first": times[0].astimezone().isoformat(timespec="minutes") if times else None,
        "last": times[-1].astimezone().isoformat(timespec="minutes") if times else None,
        "active_minutes": round(active / 60, 1),
        "requests": len(run.usage_by_request),
        "tool_calls": sum(tools.values()),
        "tool_failures": sum(failures.values()),
        "mcp_calls": sum(mcp.values()),
        "bash_calls": tools.get("Bash", 0),
        "resource_reads": tools.get("ReadMcpResourceTool", 0),
        "input_tokens": total("input_tokens"),
        "output_tokens": total("output_tokens"),
        "cache_read_tokens": total("cache_read_input_tokens"),
        "cache_write_tokens": total("cache_creation_input_tokens"),
        "top_mcp_tools": dict(mcp.most_common(12)),
        "top_tools": dict(tools.most_common(12)),
        "failures_by_tool": dict(failures.most_common(10)),
        "agents": dict(run.agents),
        "convertigo_servers": sorted(convertigo),
        "mcp_failures": summed(convertigo, failures),
        "relayed_mcp_calls": sum(relayed.values()),
        "relayed_tools": dict(relayed.most_common()),
        "mcp_servers": dict(sorted(stats.items(), key=lambda item: (-item[1]["calls"], item[0]))),
        "bash_failures": failures.get("Bash", 0),
        "browser_calls": summed(browsers, tools),
        "browser_failures": summed(browsers, failures),
        "playwright_calls": summed(playwright, tools) + run.playwright_commands,
        "code_cells": run.code_cells,
        "tool_seconds": round(sum(seconds.values()), 1),
        "mcp_seconds": round(summed(convertigo, seconds), 1),
        "bash_seconds": round(seconds.get("Bash", 0.0), 1),
        "browser_seconds": round(summed(browsers, seconds), 1),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", nargs="+",
                        help="transcript files, or folders searched for *.jsonl[.gz] (a Claude or Codex home)")
    parser.add_argument("--server", action="append", default=[], metavar="NAME",
                        help="an MCP server to count as a Convertigo MCP server, whatever its name (repeatable)")
    args = parser.parse_args()
    print(json.dumps(measure(transcripts(args.paths), args.server), indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
