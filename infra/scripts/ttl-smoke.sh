#!/usr/bin/env bash
set -euo pipefail

API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

TEMP_KEY=0
if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi
KEY="${HARAKIRI_API_KEY}"
cleanup_key() {
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup_key EXIT

CREATE_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d '{"template":"python-3.12","name":"ttl-smoke","ttlSeconds":10}' \
  "${API_URL}/v1/sandboxes")"
SBX_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.sandbox.id)" "${CREATE_RESPONSE}")"
echo "created ${SBX_ID} with ttl=10s"

for _ in $(seq 1 9); do
  sleep 5
  STATUS_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}")"
  STATUS="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.sandbox.status)" "${STATUS_RESPONSE}")"
  echo "status ${STATUS}"
  if [[ "${STATUS}" == "terminated" ]]; then
    echo "ttl smoke passed"
    exit 0
  fi
done

echo "ttl smoke failed: ${SBX_ID} was not terminated" >&2
exit 1
