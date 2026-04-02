#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_WORKSPACE_DIR="${SCRIPT_DIR}/workspace"
WORKSPACE_DIR="${WORKSPACE_DIR:-${DEFAULT_WORKSPACE_DIR}}"
LOG_DIR="${LOG_DIR:-${SCRIPT_DIR}/logs}"
REPORT_DIR_ROOT="${REPORT_DIR_ROOT:-${SCRIPT_DIR}/reports}"
ARTIFACT_DIR_ROOT="${ARTIFACT_DIR_ROOT:-}"
MCP_URL="${MCP_URL:-http://localhost:18080/convertigo/api/mcp}"
MCP_PROTOCOL_VERSION="${MCP_PROTOCOL_VERSION:-2025-06-18}"

mkdir -p "${WORKSPACE_DIR}" "${LOG_DIR}"

PROMPT_FILE="${1:-${SCRIPT_DIR}/prompt.txt}"
RUN_LABEL="${2:-$(basename "${PROMPT_FILE}" .txt)}"
ROLE_PROMPT_NAME="${3:-}"
RUN_STAMP="${RUN_STAMP:-$(date +%Y%m%d_%H%M%S)}"
RUN_ID="${RUN_LABEL}_${RUN_STAMP}"
PAYLOAD_FILE="${PROMPT_FILE}"
TEMP_PROMPT_FILE=""
TEMP_RENDERED_PROMPT_FILE=""
UNRESOLVED_PLACEHOLDERS=""
CODEX_MODEL="${CODEX_MODEL:-}"
CODEX_REASONING_EFFORT="${CODEX_REASONING_EFFORT:-medium}"
CODEX_REQUEST_TIMEOUT="${CODEX_REQUEST_TIMEOUT:-900}"
ROLE_PROMPT_ID=""
ROLE_PROMPT_REVISION=""
ROLE_PROMPT_FETCHED="false"
ROLE_PROMPT_METADATA_JSON=""
MCP_SERVER_INFO_JSON=""
MCP_INITIALIZE_WARNING=""
SUITE_ID="${SUITE_ID:-}"
CANDIDATE_ID="${CANDIDATE_ID:-}"
SCENARIO_ID="${SCENARIO_ID:-}"
BENCHMARK_ID="${BENCHMARK_ID:-}"
WORKSPACE_ID="${WORKSPACE_ID:-}"
FIXTURE_ID="${FIXTURE_ID:-}"
FIXTURE_ALIAS="${FIXTURE_ALIAS:-}"
TARGET_PROJECT="${TARGET_PROJECT:-}"
FIXTURE_SOURCE_PROJECT="${FIXTURE_SOURCE_PROJECT:-}"
FIXTURE_CREATED_BY_RUNNER="${FIXTURE_CREATED_BY_RUNNER:-}"
CRITIC_TARGET_RUN_ID="${CRITIC_TARGET_RUN_ID:-}"
CODEX_DISABLE_MCP="${CODEX_DISABLE_MCP:-0}"
DEFAULT_CODEX_BIN="${SCRIPT_DIR}/bin/codex"
if [[ -x "${DEFAULT_CODEX_BIN}" ]]; then
  CODEX_BIN="${CODEX_BIN:-${DEFAULT_CODEX_BIN}}"
else
  CODEX_BIN="${CODEX_BIN:-codex}"
fi

if [[ -n "${ARTIFACT_DIR_ROOT}" ]]; then
  RUN_ARTIFACT_DIR="${ARTIFACT_DIR_ROOT}/${RUN_ID}"
  mkdir -p "${RUN_ARTIFACT_DIR}"
  LOG_FILE="${RUN_ARTIFACT_DIR}/raw.log"
  REPORT_DIR="${RUN_ARTIFACT_DIR}"
else
  LOG_FILE="${LOG_DIR}/${RUN_ID}.log"
  REPORT_DIR="${REPORT_DIR_ROOT}/${RUN_ID}"
fi

if grep -Eq '__[A-Z0-9_]+__' "${PROMPT_FILE}"; then
  TEMP_RENDERED_PROMPT_FILE="$(mktemp "${TMPDIR:-/tmp}/convertigo_prompt_rendered.XXXXXX")"
  UNRESOLVED_PLACEHOLDERS="$(
    python3 - "${PROMPT_FILE}" "${TEMP_RENDERED_PROMPT_FILE}" <<'PY'
import os
import pathlib
import re
import sys

source = pathlib.Path(sys.argv[1])
target = pathlib.Path(sys.argv[2])
text = source.read_text(encoding="utf-8")
mapping = {
    "__TARGET_PROJECT__": os.getenv("TARGET_PROJECT", ""),
    "__FIXTURE_SOURCE_PROJECT__": os.getenv("FIXTURE_SOURCE_PROJECT", ""),
    "__PG_HOST__": os.getenv("PG_HOST", ""),
    "__PG_PORT__": os.getenv("PG_PORT", ""),
    "__PG_DATABASE__": os.getenv("PG_DATABASE", ""),
    "__PG_USER__": os.getenv("PG_USER", ""),
    "__PG_PASSWORD__": os.getenv("PG_PASSWORD", ""),
    "__FIXTURE_METADATA_PATH__": os.getenv("FIXTURE_METADATA_PATH", ""),
    "__WORKTREE_PATH__": os.getenv("WORKTREE_PATH", ""),
    "__MAINTAINER_PACKET_PATH__": os.getenv("MAINTAINER_PACKET_PATH", ""),
    "__MAINTAINER_PACKET_CONTENT__": os.getenv("MAINTAINER_PACKET_CONTENT", ""),
    "__BASELINE_PROJECT_VERSION__": os.getenv("BASELINE_PROJECT_VERSION", ""),
    "__TARGET_PROJECT_VERSION__": os.getenv("TARGET_PROJECT_VERSION", ""),
    "__COMMIT_MESSAGE__": os.getenv("COMMIT_MESSAGE", ""),
}

for key, value in mapping.items():
    if value:
        text = text.replace(key, value)

target.write_text(text, encoding="utf-8")
placeholders = sorted(set(re.findall(r"__([A-Z0-9_]+)__", text)))
print(" ".join(f"__{name}__" for name in placeholders))
PY
  )"
  PAYLOAD_FILE="${TEMP_RENDERED_PROMPT_FILE}"
  if [[ -n "${UNRESOLVED_PLACEHOLDERS}" ]]; then
    echo "Prompt contains unresolved placeholders after rendering: ${UNRESOLVED_PLACEHOLDERS}" >&2
    exit 1
  fi
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
    cat "${PAYLOAD_FILE}"
  } > "${TEMP_PROMPT_FILE}"
  PAYLOAD_FILE="${TEMP_PROMPT_FILE}"
  ROLE_PROMPT_FETCHED="true"
fi

{
  echo "codex_bin=${CODEX_BIN}"
  echo "codex_version=$("${CODEX_BIN}" --version)"
  echo "run_id=${RUN_ID}"
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
  if [[ -n "${UNRESOLVED_PLACEHOLDERS}" ]]; then
    echo "prompt_placeholders_unresolved=${UNRESOLVED_PLACEHOLDERS}"
  fi
  if [[ -n "${SUITE_ID}" ]]; then
    echo "suite_id=${SUITE_ID}"
  fi
  if [[ -n "${CANDIDATE_ID}" ]]; then
    echo "candidate_id=${CANDIDATE_ID}"
  fi
  if [[ -n "${SCENARIO_ID}" ]]; then
    echo "scenario_id=${SCENARIO_ID}"
  fi
  if [[ -n "${BENCHMARK_ID}" ]]; then
    echo "benchmark_id=${BENCHMARK_ID}"
  fi
  if [[ -n "${WORKSPACE_ID}" ]]; then
    echo "workspace_id=${WORKSPACE_ID}"
  fi
  if [[ -n "${FIXTURE_ID}" ]]; then
    echo "fixture_id=${FIXTURE_ID}"
  fi
  if [[ -n "${FIXTURE_ALIAS}" ]]; then
    echo "fixture_alias=${FIXTURE_ALIAS}"
  fi
  if [[ -n "${TARGET_PROJECT}" ]]; then
    echo "target_project=${TARGET_PROJECT}"
  fi
  if [[ -n "${FIXTURE_SOURCE_PROJECT}" ]]; then
    echo "fixture_source_project=${FIXTURE_SOURCE_PROJECT}"
  fi
  if [[ -n "${FIXTURE_CREATED_BY_RUNNER}" ]]; then
    echo "fixture_created_by_runner=${FIXTURE_CREATED_BY_RUNNER}"
  fi
  if [[ -n "${CRITIC_TARGET_RUN_ID}" ]]; then
    echo "critic_target_run_id=${CRITIC_TARGET_RUN_ID}"
  fi
  echo "codex_model=${CODEX_MODEL:-default}"
  echo "codex_reasoning_effort=${CODEX_REASONING_EFFORT}"
  echo "codex_request_timeout=${CODEX_REQUEST_TIMEOUT}"
  echo "started_at=$(date -Iseconds)"
} | tee "${LOG_FILE}"

CODEX_ARGS=(
  exec
  -s
  danger-full-access
  --config 'mcp_servers={}'
  --config "model_reasoning_effort=\"${CODEX_REASONING_EFFORT}\""
  --config "request_timeout=${CODEX_REQUEST_TIMEOUT}"
  --cd "${WORKSPACE_DIR}"
)

if [[ "${CODEX_DISABLE_MCP}" != "1" ]]; then
  CODEX_ARGS+=(
    --config 'mcp_servers.convertigo={type="http"}'
    --config "mcp_servers.convertigo.url=\"${MCP_URL}\""
  )
fi

if [[ -n "${CODEX_MODEL}" ]]; then
  CODEX_ARGS+=(--model "${CODEX_MODEL}")
fi

"${CODEX_BIN}" "${CODEX_ARGS[@]}" "$(cat "$PAYLOAD_FILE")" 2>&1 | tee -a "${LOG_FILE}"

echo "finished_at=$(date -Iseconds)" | tee -a "${LOG_FILE}"

python3 "${SCRIPT_DIR}/scripts/report_codex_run.py" \
  --log "${LOG_FILE}" \
  --out-dir "${REPORT_DIR}" \
  --mcp-url "${MCP_URL}"

if [[ -n "${TEMP_PROMPT_FILE}" ]]; then
  rm -f "${TEMP_PROMPT_FILE}"
fi

if [[ -n "${TEMP_RENDERED_PROMPT_FILE}" ]]; then
  rm -f "${TEMP_RENDERED_PROMPT_FILE}"
fi

echo "RunId: ${RUN_ID}"
echo "Log: $LOG_FILE"
echo "Report: ${REPORT_DIR}/report.json"
echo "Summary: ${REPORT_DIR}/summary.md"
