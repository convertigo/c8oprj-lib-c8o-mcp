#!/usr/bin/env python3
import argparse
import json
import re
from urllib.request import Request, urlopen

from validate_crud_tools import DEFAULT_MCP_URL, PROTOCOL_VERSION, ROOT, wait_for_mcp_ready


def parse_args():
    parser = argparse.ArgumentParser(description="Validate the lightweight MCP guidance version handshake.")
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL)
    return parser.parse_args()


def expected_version():
    source = (ROOT / "js" / "guidance_version.js").read_text(encoding="utf-8")
    match = re.search(r'C8O\.MCP_GUIDANCE_VERSION\s*=\s*"([^"]+)"', source)
    if not match:
        raise RuntimeError("Unable to read C8O.MCP_GUIDANCE_VERSION")
    return match.group(1)


def call_mcp(url, payload, extra_headers=None, timeout=60):
    headers = {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": PROTOCOL_VERSION,
    }
    if extra_headers:
        headers.update(extra_headers)
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        return json.load(response)


def tool_call_payload(tool_name="project-list", arguments=None, meta=None):
    params = {
        "name": tool_name,
        "arguments": arguments or {"limit": 1},
    }
    if meta is not None:
        params["_meta"] = meta
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": params,
    }


def guidance_warning(response):
    return (
        response.get("result", {})
        .get("_meta", {})
        .get("convertigoGuidanceWarning", "")
    )


def assert_true(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    args = parse_args()
    version = expected_version()
    wait_for_mcp_ready(args.mcp_url, timeout=90)

    missing = call_mcp(args.mcp_url, tool_call_payload())
    assert_true(
        guidance_warning(missing) == f"mcp_guidance_version_missing expected={version}",
        f"Missing-version warning mismatch: {missing}",
    )

    read_only_missing = call_mcp(
        args.mcp_url,
        tool_call_payload("databaseobject-search", {"filter": "__guidance_probe__", "limit": 1}),
    )
    assert_true(
        not guidance_warning(read_only_missing),
        f"Read-only tools should not repeat guidance warnings: {read_only_missing}",
    )

    mismatch = call_mcp(
        args.mcp_url,
        tool_call_payload(meta={"convertigoGuidanceVersion": "old-guidance"}),
    )
    assert_true(
        guidance_warning(mismatch) == f"mcp_guidance_version_mismatch expected={version} got=old-guidance",
        f"Mismatch warning mismatch: {mismatch}",
    )

    meta_ok = call_mcp(
        args.mcp_url,
        tool_call_payload(meta={"convertigoGuidanceVersion": version}),
    )
    assert_true(not guidance_warning(meta_ok), f"Unexpected warning with matching _meta: {meta_ok}")

    header_ok = call_mcp(
        args.mcp_url,
        tool_call_payload(),
        extra_headers={"X-Convertigo-Guidance-Version": version},
    )
    assert_true(not guidance_warning(header_ok), f"Unexpected warning with matching header: {header_ok}")

    argument_ok = call_mcp(
        args.mcp_url,
        tool_call_payload(arguments={"limit": 1, "__convertigoGuidanceVersion": version}),
    )
    assert_true(not guidance_warning(argument_ok), f"Unexpected warning with matching hidden argument: {argument_ok}")

    print(json.dumps({"status": "ok", "validated": "guidance-handshake"}, indent=2))


if __name__ == "__main__":
    main()
