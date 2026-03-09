#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
RUNTIME_DIR="${2:-}"
if [[ -z "${MODE}" || -z "${RUNTIME_DIR}" ]]; then
  echo "Usage: reset.sh <up|down> <runtime_dir>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${RUNTIME_DIR}/fixture.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing fixture env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
. "${ENV_FILE}"
set +a

COMPOSE_CMD=(docker compose -f "${SCRIPT_DIR}/docker-compose.yml" --project-name "${COMPOSE_PROJECT_NAME}" --env-file "${ENV_FILE}")

case "${MODE}" in
  up)
    "${COMPOSE_CMD[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
    "${COMPOSE_CMD[@]}" up -d --wait
    ;;
  down)
    "${COMPOSE_CMD[@]}" down -v --remove-orphans
    ;;
  *)
    echo "Unsupported mode: ${MODE}" >&2
    exit 1
    ;;
esac
