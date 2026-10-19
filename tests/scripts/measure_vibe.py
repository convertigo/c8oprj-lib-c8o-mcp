#!/usr/bin/env python3
"""Measures a Vibe run from its unified session journal, like measure_run.py for Claude Code.

A session folder is <vibe home>/logs/session/unified/<session>, with journal/*.jsonl. Active time is the sum of the
gaps under 10 minutes; a model request is one succeeded completion. The Convertigo MCP calls the agent makes from
run_typescript code are journaled as their own actions (mcp_Convertigo.<tool>), so they count as convertigo calls.

    python3 measure_vibe.py <session folder | vibe home> [...]
"""
import argparse
import collections
import json
import re
import sys
from pathlib import Path

GAP_MS = 10 * 60 * 1000


def journals(paths):
    files = []
    for raw in paths:
        path = Path(raw).expanduser()
        if not path.is_dir():
            sys.exit("not a folder: " + raw)
        found = sorted(path.glob("journal/*.jsonl")) or sorted(path.glob("**/logs/session/unified/*/journal/*.jsonl"))
        if not found:
            sys.exit("no journal/*.jsonl under " + raw)
        files += found
    return files


def measure(files):
    times = []
    requests = 0
    usage = collections.Counter()
    tools = collections.Counter()
    failed = collections.Counter()
    finish = collections.Counter()
    names_by_action = {}
    for file in files:
        for line in file.open(encoding="utf-8"):
            try:
                record = json.loads(line)
            except ValueError:
                continue
            times += [int(m.group(1)) for m in re.finditer(r'"(?:time_unix_ms|createdAt)":\s*(1[0-9]{12})', line)]
            payload = record.get("payload") or {}
            kind = record.get("type")
            if kind == "action_intent" and payload.get("kind") == "tool":
                call = (payload.get("request") or {}).get("call") or {}
                name = call.get("name") or call.get("tool_name") or "?"
                if call.get("group_name"):
                    name = call["group_name"] + "." + name
                names_by_action[payload.get("action_id")] = name
            elif kind == "action_result":
                outer = payload.get("result") or {}
                result = outer.get("result") or {}
                result_type = outer.get("type") or result.get("type")
                if result_type == "completion_succeeded":
                    requests += 1
                    for key, value in (result.get("usage") or {}).items():
                        if isinstance(value, (int, float)):
                            usage[key] += value
                    finish[result.get("finish_reason")] += 1
                elif result_type in ("tool_succeeded", "tool_failed"):
                    tool = names_by_action.get(payload.get("action_id"), "?")
                    tools[tool] += 1
                    if result_type == "tool_failed":
                        failed[tool] += 1
    times.sort()
    active = sum(b - a for a, b in zip(times, times[1:]) if b - a < GAP_MS)
    return {
        "journals": len(files),
        "active_minutes": round(active / 60000, 1),
        "wall_minutes": round((times[-1] - times[0]) / 60000, 1) if times else 0,
        "requests": requests,
        "input_tokens": usage["input_tokens"],
        "cached_input_tokens": usage["cached_input_tokens"],
        "output_tokens": usage["output_tokens"],
        "tool_calls": sum(tools.values()),
        "tool_failures": sum(failed.values()),
        "convertigo_calls": sum(v for k, v in tools.items() if k.startswith("mcp_Convertigo.")),
        "bash_calls": sum(v for k, v in tools.items() if k.endswith(".bash") or k == "bash"),
        "finish_reasons": dict(finish),
        "top_tools": dict(tools.most_common(15)),
        "failures_by_tool": dict(failed.most_common(10)),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", nargs="+", help="session folders (with journal/) or Vibe homes")
    args = parser.parse_args()
    print(json.dumps(measure(journals(args.paths)), indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
