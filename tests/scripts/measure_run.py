#!/usr/bin/env python3
"""Measures a Claude Code run from its transcripts (projects/<dir>/<session>.jsonl of a Claude home).

Active time is the sum of the gaps under 10 minutes between records, so a run left waiting does not count. A model
request is one assistant message id: Claude Code writes one record per content block of the same message. Convertigo
MCP calls are the tools named mcp__convertigo__*.

    python3 measure_run.py <transcript.jsonl | Claude home | folder> [...]
"""
import argparse
import collections
import datetime
import json
import sys
from pathlib import Path

GAP_SECONDS = 600
MCP_PREFIX = "mcp__convertigo__"


def transcripts(paths):
    files = []
    for raw in paths:
        path = Path(raw).expanduser()
        if path.is_dir():
            files += sorted(path.glob("**/*.jsonl"))
        elif path.is_file():
            files.append(path)
        else:
            sys.exit("not found: " + raw)
    return files


def timestamp(text):
    return datetime.datetime.fromisoformat(text.replace("Z", "+00:00"))


def measure(files):
    times = []
    usage_by_message = {}
    tools = collections.Counter()
    failures = collections.Counter()
    names = {}
    for file in files:
        for line in file.open(encoding="utf-8"):
            try:
                record = json.loads(line)
            except ValueError:
                continue
            if record.get("timestamp"):
                times.append(timestamp(record["timestamp"]))
            message = record.get("message") or {}
            content = message.get("content") if isinstance(message.get("content"), list) else []
            if record.get("type") == "assistant":
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        tools[block.get("name", "?")] += 1
                        names[block.get("id")] = block.get("name", "?")
                if message.get("id"):
                    usage_by_message[message["id"]] = message.get("usage") or {}
            elif record.get("type") == "user":
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result" and block.get("is_error"):
                        failures[names.get(block.get("tool_use_id"), "?")] += 1
    times.sort()
    active = sum(d for d in ((b - a).total_seconds() for a, b in zip(times, times[1:])) if d < GAP_SECONDS)

    def total(key):
        return sum((usage.get(key) or 0) for usage in usage_by_message.values())

    mcp = collections.Counter({name[len(MCP_PREFIX):]: count for name, count in tools.items() if name.startswith(MCP_PREFIX)})
    return {
        "transcripts": len(files),
        "first": times[0].astimezone().isoformat(timespec="minutes") if times else None,
        "last": times[-1].astimezone().isoformat(timespec="minutes") if times else None,
        "active_minutes": round(active / 60, 1),
        "requests": len(usage_by_message),
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
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", nargs="+", help="transcript files, or folders searched for *.jsonl (a Claude home)")
    args = parser.parse_args()
    print(json.dumps(measure(transcripts(args.paths)), indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
