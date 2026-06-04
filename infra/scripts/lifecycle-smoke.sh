#!/usr/bin/env bash
set -euo pipefail

API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROUTE_PORT="${HARAKIRI_LIFECYCLE_ROUTE_PORT:-3001}"

SBX_ID=""
TEMP_KEY=0

cleanup() {
  set +e
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
  -d '{"template":"python-3.12","name":"lifecycle-smoke","ttlSeconds":120,"wait":true,"waitTimeoutMs":30000}' \
  "${API_URL}/v1/sandboxes")"
SBX_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.sandbox.id)" "${CREATE_RESPONSE}")"
echo "created ${SBX_ID}"

GET_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}")"
node -e "const r=JSON.parse(process.argv[1]); if (r.sandbox.id !== process.argv[2] || !r.sandbox.runtimeMetadata?.lifecycle) process.exit(1)" "${GET_RESPONSE}" "${SBX_ID}"
echo "reconnected ${SBX_ID}"

RENEW_RESPONSE="$(curl -fsS -X POST -H "x-api-key: ${KEY}" -H "Idempotency-Key: lifecycle-renew-${SBX_ID}" \
  "${API_URL}/v1/sandboxes/${SBX_ID}/renew")"
node -e "const r=JSON.parse(process.argv[1]); if (r.ok !== true) process.exit(1)" "${RENEW_RESPONSE}"
echo "renewed ${SBX_ID}"

curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"command\":\"python -m http.server ${ROUTE_PORT} --bind 0.0.0.0 >/tmp/harakiri-lifecycle-http.log 2>&1 &\"}" \
  "${API_URL}/v1/sandboxes/${SBX_ID}/run" >/dev/null

ROUTE_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"port\":${ROUTE_PORT},\"protocol\":\"http\",\"accessMode\":\"public\",\"labels\":[\"lifecycle-smoke\"]}" \
  "${API_URL}/v1/sandboxes/${SBX_ID}/routes")"
node -e "const r=JSON.parse(process.argv[1]); if (r.route.port !== Number(process.argv[2]) || r.route.state !== 'ready') process.exit(1)" "${ROUTE_RESPONSE}" "${ROUTE_PORT}"
echo "route exposed ${ROUTE_PORT}"

curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}" >/dev/null
echo "killed ${SBX_ID}"

STATUS_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}")"
node -e "const r=JSON.parse(process.argv[1]); if (r.sandbox.status !== 'terminated') process.exit(1)" "${STATUS_RESPONSE}"

ROUTES_AFTER="$(curl -fsS -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}/routes")"
node -e "const r=JSON.parse(process.argv[1]); if (r.routes.length !== 0) process.exit(1)" "${ROUTES_AFTER}"

POST_KILL_STATUS="$(curl -sS -o /tmp/harakiri-lifecycle-post-kill.json -w '%{http_code}' \
  -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d '{"command":"python --version"}' \
  "${API_URL}/v1/sandboxes/${SBX_ID}/run")"
if [[ "${POST_KILL_STATUS}" =~ ^2 ]]; then
  echo "lifecycle smoke failed: post-kill run unexpectedly returned ${POST_KILL_STATUS}" >&2
  cat /tmp/harakiri-lifecycle-post-kill.json >&2 || true
  exit 1
fi

SBX_ID=""
echo "lifecycle smoke passed"

