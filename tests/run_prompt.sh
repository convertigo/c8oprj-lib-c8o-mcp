#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="${SCRIPT_DIR}/workspace"
LOG_DIR="${SCRIPT_DIR}/logs"

mkdir -p "${WORKSPACE_DIR}" "${LOG_DIR}"

PROMPT_FILE="${1:-${SCRIPT_DIR}/prompt.txt}"
LOG_FILE="${LOG_DIR}/run_$(date +%Y%m%d_%H%M%S).log"

codex exec \
  --config 'mcp.servers.convertigo.type="http"' \
  --config 'mcp.servers.convertigo.url="http://localhost:18080/convertigo/api/mcp"' \
  --config 'model_reasoning_effort="low"' \
  --config 'request_timeout=600' \
  --config 'sandbox=danger-full-access' \
  --config 'ask-for-approval=never' \
  --cd "${WORKSPACE_DIR}" \
  "$(cat "$PROMPT_FILE")" \
  2>&1 | tee "$LOG_FILE"

echo "Log: $LOG_FILE"
