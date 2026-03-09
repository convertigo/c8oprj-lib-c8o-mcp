#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="${SCRIPT_DIR}/workspace"
LOG_DIR="${SCRIPT_DIR}/logs"
REPORT_DIR_ROOT="${SCRIPT_DIR}/reports"
MCP_URL="${MCP_URL:-http://localhost:18080/convertigo/api/mcp}"
MCP_PROTOCOL_VERSION="${MCP_PROTOCOL_VERSION:-2025-06-18}"

mkdir -p "${WORKSPACE_DIR}" "${LOG_DIR}"

PROMPT_FILE="${1:-${SCRIPT_DIR}/prompt.txt}"
RUN_LABEL="${2:-$(basename "${PROMPT_FILE}" .txt)}"
ROLE_PROMPT_NAME="${3:-}"
LOG_FILE="${LOG_DIR}/${RUN_LABEL}_$(date +%Y%m%d_%H%M%S).log"
PAYLOAD_FILE="${PROMPT_FILE}"
TEMP_PROMPT_FILE=""
CODEX_MODEL="${CODEX_MODEL:-}"
CODEX_REASONING_EFFORT="${CODEX_REASONING_EFFORT:-medium}"
CODEX_REQUEST_TIMEOUT="${CODEX_REQUEST_TIMEOUT:-900}"
ROLE_PROMPT_ID=""
ROLE_PROMPT_REVISION=""
ROLE_PROMPT_FETCHED="false"
ROLE_PROMPT_METADATA_JSON=""
MCP_SERVER_INFO_JSON=""
MCP_INITIALIZE_WARNING=""
DEFAULT_CODEX_BIN="${SCRIPT_DIR}/bin/codex"
if [[ -x "${DEFAULT_CODEX_BIN}" ]]; then
  CODEX_BIN="${CODEX_BIN:-${DEFAULT_CODEX_BIN}}"
else
  CODEX_BIN="${CODEX_BIN:-codex}"
fi

INIT_RESPONSE="$(curl -sS -X POST "${MCP_URL}" \
  -H 'Content-Type: application/json' \
  -H "MCP-Protocol-Version: ${MCP_PROTOCOL_VERSION}" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' 2>&1 || true)"
if printf '%s' "${INIT_RESPONSE}" | jq -e '.result.serverInfo' >/dev/null 2>&1; then
  MCP_SERVER_INFO_JSON="$(printf '%s' "${INIT_RESPONSE}" | jq -c '.result.serverInfo')"
else
  MCP_INITIALIZE_WARNING="$(printf '%s' "${INIT_RESPONSE}" | tr '\n' ' ' | sed 's/[[:space:]]\\+/ /g')"
fi

if [[ -n "${ROLE_PROMPT_NAME}" ]]; then
  ROLE_PROMPT_JSON="$(curl -sS -X POST "${MCP_URL}" \
    -H 'Content-Type: application/json' \
    -H "MCP-Protocol-Version: ${MCP_PROTOCOL_VERSION}" \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"prompts/call\",\"params\":{\"name\":\"${ROLE_PROMPT_NAME}\"}}")"
  ROLE_PROMPT_TEXT="$(printf '%s' "${ROLE_PROMPT_JSON}" | jq -r '.result.messages[0].content.text // empty')"
  ROLE_PROMPT_ID="$(printf '%s' "${ROLE_PROMPT_JSON}" | jq -r '.result.promptId // empty')"
  ROLE_PROMPT_REVISION="$(printf '%s' "${ROLE_PROMPT_JSON}" | jq -r '.result.revision // empty')"
  ROLE_PROMPT_METADATA_JSON="$(printf '%s' "${ROLE_PROMPT_JSON}" | jq -c '.result | del(.messages)')"
  if [[ -z "${ROLE_PROMPT_TEXT}" ]]; then
    echo "Failed to fetch MCP prompt: ${ROLE_PROMPT_NAME}" >&2
    printf '%s\n' "${ROLE_PROMPT_JSON}" >&2
    exit 1
  fi
  TEMP_PROMPT_FILE="$(mktemp "${TMPDIR:-/tmp}/convertigo_role_prompt.XXXXXX")"
  {
    echo "# Injected MCP role prompt: ${ROLE_PROMPT_NAME}"
    echo
    printf '%s\n' "${ROLE_PROMPT_TEXT}"
    echo
    echo "---"
    echo
    cat "${PROMPT_FILE}"
  } > "${TEMP_PROMPT_FILE}"
  PAYLOAD_FILE="${TEMP_PROMPT_FILE}"
  ROLE_PROMPT_FETCHED="true"
fi

{
  echo "codex_bin=${CODEX_BIN}"
  echo "codex_version=$("${CODEX_BIN}" --version)"
  echo "run_label=${RUN_LABEL}"
  echo "prompt_file=${PROMPT_FILE}"
  echo "mcp_url=${MCP_URL}"
  if [[ -n "${MCP_SERVER_INFO_JSON}" ]]; then
    echo "mcp_server_info_json=${MCP_SERVER_INFO_JSON}"
  fi
  if [[ -n "${MCP_INITIALIZE_WARNING}" ]]; then
    echo "mcp_initialize_warning=${MCP_INITIALIZE_WARNING}"
  fi
  echo "role_prompt_name=${ROLE_PROMPT_NAME:-none}"
  echo "role_prompt_fetched=${ROLE_PROMPT_FETCHED}"
  echo "role_prompt_id=${ROLE_PROMPT_ID:-none}"
  echo "role_prompt_revision=${ROLE_PROMPT_REVISION:-none}"
  if [[ -n "${ROLE_PROMPT_METADATA_JSON}" ]]; then
    echo "role_prompt_metadata_json=${ROLE_PROMPT_METADATA_JSON}"
  fi
  echo "codex_model=${CODEX_MODEL:-default}"
  echo "codex_reasoning_effort=${CODEX_REASONING_EFFORT}"
  echo "codex_request_timeout=${CODEX_REQUEST_TIMEOUT}"
  echo "started_at=$(date -Iseconds)"
} | tee "${LOG_FILE}"

CODEX_ARGS=(
  exec
  --config 'mcp.servers.convertigo.type="http"'
  --config "mcp.servers.convertigo.url=\"${MCP_URL}\""
  --config "model_reasoning_effort=\"${CODEX_REASONING_EFFORT}\""
  --config "request_timeout=${CODEX_REQUEST_TIMEOUT}"
  --config 'sandbox=danger-full-access'
  --config 'ask-for-approval=never'
  --cd "${WORKSPACE_DIR}"
)

if [[ -n "${CODEX_MODEL}" ]]; then
  CODEX_ARGS+=(--model "${CODEX_MODEL}")
fi

"${CODEX_BIN}" "${CODEX_ARGS[@]}" "$(cat "$PAYLOAD_FILE")" 2>&1 | tee -a "${LOG_FILE}"

echo "finished_at=$(date -Iseconds)" | tee -a "${LOG_FILE}"

RUN_ID="$(basename "${LOG_FILE}" .log)"
REPORT_DIR="${REPORT_DIR_ROOT}/${RUN_ID}"
python3 "${SCRIPT_DIR}/scripts/report_codex_run.py" \
  --log "${LOG_FILE}" \
  --out-dir "${REPORT_DIR}" \
  --mcp-url "${MCP_URL}"

if [[ -n "${TEMP_PROMPT_FILE}" ]]; then
  rm -f "${TEMP_PROMPT_FILE}"
fi

echo "Log: $LOG_FILE"
echo "Report: ${REPORT_DIR}/report.json"
echo "Summary: ${REPORT_DIR}/summary.md"
