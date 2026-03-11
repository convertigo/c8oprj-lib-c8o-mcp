#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUT_DIR="${ROOT_DIR}/review/live-contract"
SERVER_URL="${1:-http://localhost:18080/convertigo/api/mcp}"
PROTOCOL_VERSION="2025-06-18"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"

call_json() {
  local request="$1"
  shift || true
  curl -sS -X POST "${SERVER_URL}" \
    -H "Content-Type: application/json" \
    "$@" \
    -d "${request}"
}

INIT_JSON="$(call_json '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}')"
TOOLS_JSON="$(call_json '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' -H "MCP-Protocol-Version: ${PROTOCOL_VERSION}")"
RESOURCES_JSON="$(call_json '{"jsonrpc":"2.0","id":3,"method":"resources/list","params":{}}' -H "MCP-Protocol-Version: ${PROTOCOL_VERSION}")"
PROMPTS_JSON="$(call_json '{"jsonrpc":"2.0","id":4,"method":"prompts/list","params":{}}' -H "MCP-Protocol-Version: ${PROTOCOL_VERSION}")"
CAPABILITIES_JSON="$(call_json '{"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"convertigo://capabilities"}}' -H "MCP-Protocol-Version: ${PROTOCOL_VERSION}")"
RECIPES_JSON="$(call_json '{"jsonrpc":"2.0","id":6,"method":"resources/read","params":{"uri":"convertigo://recipes/quickstart"}}' -H "MCP-Protocol-Version: ${PROTOCOL_VERSION}")"

TOOL_COUNT_1="$(call_json '{"jsonrpc":"2.0","id":7,"method":"tools/list","params":{}}' -H "MCP-Protocol-Version: ${PROTOCOL_VERSION}" | jq '.result.tools | length')"
TOOL_COUNT_2="$(call_json '{"jsonrpc":"2.0","id":8,"method":"tools/list","params":{}}' -H "MCP-Protocol-Version: ${PROTOCOL_VERSION}" | jq '.result.tools | length')"
RESOURCE_COUNT_1="$(call_json '{"jsonrpc":"2.0","id":9,"method":"resources/list","params":{}}' -H "MCP-Protocol-Version: ${PROTOCOL_VERSION}" | jq '.result.resources | length')"
RESOURCE_COUNT_2="$(call_json '{"jsonrpc":"2.0","id":10,"method":"resources/list","params":{}}' -H "MCP-Protocol-Version: ${PROTOCOL_VERSION}" | jq '.result.resources | length')"
PROMPT_COUNT_1="$(call_json '{"jsonrpc":"2.0","id":11,"method":"prompts/list","params":{}}' -H "MCP-Protocol-Version: ${PROTOCOL_VERSION}" | jq '.result.prompts | length')"
PROMPT_COUNT_2="$(call_json '{"jsonrpc":"2.0","id":12,"method":"prompts/list","params":{}}' -H "MCP-Protocol-Version: ${PROTOCOL_VERSION}" | jq '.result.prompts | length')"

SERVER_VERSION="$(jq -r '.result.serverInfo.version' <<<"${INIT_JSON}")"
BASELINE_FILE="${OUT_DIR}/baseline.local-${SERVER_VERSION}.json"
TOOL_CATALOG_FILE="${OUT_DIR}/tool-catalog.local-${SERVER_VERSION}.json"

jq -n \
  --arg serverUrl "${SERVER_URL}" \
  --arg protocolVersion "${PROTOCOL_VERSION}" \
  --argjson initialize "${INIT_JSON}" \
  --argjson tools "${TOOLS_JSON}" \
  --argjson resources "${RESOURCES_JSON}" \
  --argjson prompts "${PROMPTS_JSON}" \
  --argjson capabilities "${CAPABILITIES_JSON}" \
  --argjson recipes "${RECIPES_JSON}" \
  --argjson toolCount1 "${TOOL_COUNT_1}" \
  --argjson toolCount2 "${TOOL_COUNT_2}" \
  --argjson resourceCount1 "${RESOURCE_COUNT_1}" \
  --argjson resourceCount2 "${RESOURCE_COUNT_2}" \
  --argjson promptCount1 "${PROMPT_COUNT_1}" \
  --argjson promptCount2 "${PROMPT_COUNT_2}" \
  '{
    schemaVersion: "1.0.0",
    capturedAt: (now | todateiso8601),
    serverUrl: $serverUrl,
    protocolVersion: $protocolVersion,
    sourceOfTruthOrder: [
      "live MCP signature and behavior",
      "repository implementation and exported schemas",
      "repository documentation, prompts, and tests",
      "colleague repositories as pattern sources only"
    ],
    serverInfo: $initialize.result.serverInfo,
    initialize: $initialize.result,
    counts: {
      tools: ($tools.result.tools | length),
      resources: ($resources.result.resources | length),
      prompts: ($prompts.result.prompts | length)
    },
    consistencyCheck: {
      tools: [$toolCount1, $toolCount2],
      resources: [$resourceCount1, $resourceCount2],
      prompts: [$promptCount1, $promptCount2]
    },
    toolNames: ($tools.result.tools | map(.name)),
    resources: ($resources.result.resources),
    prompts: ($prompts.result.prompts),
    builtInResources: [
      {
        uri: "convertigo://capabilities",
        mimeType: ($capabilities.result.contents[0].mimeType // ""),
        text: ($capabilities.result.contents[0].text // "")
      },
      {
        uri: "convertigo://recipes/quickstart",
        mimeType: ($recipes.result.contents[0].mimeType // ""),
        text: ($recipes.result.contents[0].text // "")
      }
    ]
  }' > "${BASELINE_FILE}"

jq \
  'def inputProps: (.inputSchema.properties // {});
   def outputProps: (.outputSchema.properties // {});
   def isOpenObjectSchema:
     ((.type // "") == "object")
     and ((.additionalProperties // false) == true);
   def isClosedEmptyObjectSchema:
     ((.type // "") == "object")
     and (((.properties // {}) | length) == 0)
     and ((.additionalProperties // false) != true);
   def isOpaqueOutputEntry:
     (
       (.key | test("Json$|Array$"))
       or (.key == "Tree")
       or (.key == "Forest")
       or (
         .key == "result"
         and (
           (.value.type // "") == "string"
           or (.value | isClosedEmptyObjectSchema)
         )
       )
       or (
         .key == "lines"
         and ((.value.type // "") == "string")
       )
       or (
         .key == "error"
         and (
           (.value.type // "") == "object"
           or (.value.type // "") == "array"
         )
       )
     );
   {
     schemaVersion: "1.0.0",
     capturedAt: (now | todateiso8601),
     serverVersion: .result.serverInfo.version,
     source: "tools/list",
     query: .toolsQuery,
     tools: (
       .tools
       | map({
           name,
           category,
           title,
           description,
           inputSchema,
           outputSchema,
           claritySignals: {
             titleEqualsDescription: (.title == .description),
             vagueTitle: (.title == "Execute" or .title == "Project JS Get" or .title == "Project JS Set"),
             undocumentedInputProperties: (
               inputProps
               | to_entries
               | map(select((.value.description // "") == "") | .key)
             ),
             stringFlagsWithoutEnums: (
               inputProps
               | to_entries
               | map(
                   select(
                     (.value.type // "") == "string"
                     and (
                       (.key | test("auto|include|refresh|internal|verbose|update|stream|matchCase|useRegExp"))
                       or (.key == "limit")
                     )
                     and ((.value.enum // []) | length == 0)
                   )
                   | .key
                 )
             ),
             opaqueOutputProperties: (
               outputProps
               | to_entries
               | map(select(isOpaqueOutputEntry) | .key)
             )
           }
         })
     )
   }' \
  --argjson toolsQuery "$(jq '.result.query' <<<"${TOOLS_JSON}")" \
  --argjson resultServerInfo "$(jq '.result.serverInfo' <<<"${INIT_JSON}")" \
  < <(jq -n --argjson tools "${TOOLS_JSON}" --argjson init "${INIT_JSON}" '{tools: $tools.result.tools, toolsQuery: $tools.result.query, resultServerInfo: $init.result.serverInfo, result: {serverInfo: $init.result.serverInfo}}') \
  > "${TOOL_CATALOG_FILE}"

echo "Wrote ${BASELINE_FILE}"
echo "Wrote ${TOOL_CATALOG_FILE}"
