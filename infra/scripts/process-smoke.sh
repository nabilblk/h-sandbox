#!/usr/bin/env bash
set -euo pipefail

API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${HARAKIRI_PROCESS_ROUTE_PORT:-3002}"

SBX_ID=""
CMD_ID=""
TEMP_KEY=0

cleanup() {
  set +e
  if [[ -n "${CMD_ID}" && -n "${SBX_ID}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}/commands/${CMD_ID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${SBX_ID}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}" >/dev/null 2>&1 || true
  fi
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi
KEY="${HARAKIRI_API_KEY}"

CREATE_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d '{"template":"python-3.12","name":"process-smoke","ttlSeconds":180,"wait":true,"waitTimeoutMs":30000}' \
  "${API_URL}/v1/sandboxes")"
SBX_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.sandbox.id)" "${CREATE_RESPONSE}")"
echo "created ${SBX_ID}"

COMMAND_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"command\":\"python3 -m http.server ${PORT} --bind 0.0.0.0\",\"detached\":true}" \
  "${API_URL}/v1/sandboxes/${SBX_ID}/commands")"
CMD_ID="$(node -e "const r=JSON.parse(process.argv[1]); if (!r.command.id || r.command.detached !== true) process.exit(1); console.log(r.command.id)" "${COMMAND_RESPONSE}")"
echo "started ${CMD_ID}"

for _ in $(seq 1 30); do
  STATUS_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}/commands/${CMD_ID}")"
  STATUS="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.command.status)" "${STATUS_RESPONSE}")"
  [[ "${STATUS}" == "running" ]] && break
  sleep 1
done
[[ "${STATUS}" == "running" ]] || { echo "process smoke failed: command status ${STATUS}" >&2; exit 1; }
echo "reattached ${CMD_ID}"

LOGS_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}/commands/${CMD_ID}/logs?tail=20")"
node -e "const r=JSON.parse(process.argv[1]); if (r.commandId !== process.argv[2] || r.tail !== 20) process.exit(1)" "${LOGS_RESPONSE}" "${CMD_ID}"
echo "logs tailed ${CMD_ID}"

ROUTE_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"port\":${PORT},\"protocol\":\"http\",\"accessMode\":\"public\",\"labels\":[\"process-smoke\"]}" \
  "${API_URL}/v1/sandboxes/${SBX_ID}/routes")"
node -e "const r=JSON.parse(process.argv[1]); if (r.route.port !== Number(process.argv[2]) || !r.route.url) process.exit(1)" "${ROUTE_RESPONSE}" "${PORT}"
echo "route exposed ${PORT}"

KILL_RESPONSE="$(curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}/commands/${CMD_ID}")"
node -e "const r=JSON.parse(process.argv[1]); if (r.command.status !== 'killed' || r.command.finishReason !== 'killed') process.exit(1)" "${KILL_RESPONSE}"
echo "killed ${CMD_ID}"
CMD_ID=""

curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}" >/dev/null
echo "killed ${SBX_ID}"
SBX_ID=""

echo "process smoke passed"
