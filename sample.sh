#!/usr/bin/env bash
set -euo pipefail

ENDPOINT="http://localhost:18080/convertigo/api/mcp"

function call() {
  local label="$1"
  shift
  echo ""
  echo "=== ${label}"
  curl -s -D - "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    "$@" \
    | sed 's/^/    /'
}

# 1) Handshake initialize (sans en-tête MCP)
call "initialize" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}'

## 2) tools/list première page (avec en-tête MCP)
#call "tools/list (admin page)" \
#  -H "MCP-Protocol-Version: 2025-06-18" \
#  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
#
## 3) tools/list seconde page (project)
#call "tools/list (project page)" \
#  -H "MCP-Protocol-Version: 2025-06-18" \
#  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{"cursor":"project"}}'
#
## 4) tools/call : admin.get-engine-version
#call "tools/call admin.get-engine-version" \
#  -H "MCP-Protocol-Version: 2025-06-18" \
#  -d '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"admin.get-engine-version","arguments":{}}}'
#
## 5) tools/call : admin.get-engine-metrics
#call "tools/call admin.get-engine-metrics" \
#  -H "MCP-Protocol-Version: 2025-06-18" \
#  -d '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"admin.get-engine-metrics","arguments":{}}}'
