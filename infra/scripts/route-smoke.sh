#!/usr/bin/env bash
set -euo pipefail

API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SBX_ID=""
TEMP_KEY=0
if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi
KEY="${HARAKIRI_API_KEY}"
cleanup() {
  if [[ -n "${SBX_ID}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}" >/dev/null 2>&1 || true
  fi
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

CREATE_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d '{"template":"python-3.12","name":"route-smoke","ttlSeconds":90}' \
  "${API_URL}/v1/sandboxes")"
SBX_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.sandbox.id)" "${CREATE_RESPONSE}")"
echo "created ${SBX_ID}"

curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d '{"command":"python -m http.server 8080 --bind 0.0.0.0 >/tmp/harakiri-http.log 2>&1 &"}' \
  "${API_URL}/v1/sandboxes/${SBX_ID}/run" >/tmp/harakiri-route-run.json

TARGET="$(curl -fsS -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}/routes" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).routes[0].targetUrl))")"
echo "target ${TARGET}"

for _ in $(seq 1 12); do
  if curl -fsS "${TARGET}/" >/tmp/harakiri-route-index.html 2>/tmp/harakiri-route-curl.err; then
    sed -n '1,4p' /tmp/harakiri-route-index.html
    cleanup
    trap - EXIT
    echo "route smoke passed"
    exit 0
  fi
  sleep 2
done

echo "route smoke failed: ${TARGET} did not respond" >&2
exit 1
