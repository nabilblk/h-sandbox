#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export KUBECONFIG="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
PF_PID=""

if ! curl -fsS "${API_URL}/health" >/dev/null 2>&1; then
  kubectl -n harakiri port-forward svc/harakiri-api 18082:8080 >/tmp/harakiri-api-pf.log 2>&1 &
  PF_PID=$!
  sleep 3
fi

TEMP_KEY=0
if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi
KEY="${HARAKIRI_API_KEY}"
cleanup_key() {
  if [[ -n "${PF_PID}" ]]; then
    kill "${PF_PID}" >/dev/null 2>&1 || true
  fi
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup_key EXIT

curl -fsS "${API_URL}/health"
curl -fsS -H "x-api-key: ${KEY}" "${API_URL}/v1/templates" >/tmp/harakiri-templates.json

CREATE_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d '{"template":"python-3.12-data","name":"smoke-runner","ttlSeconds":60}' \
  "${API_URL}/v1/sandboxes")"
SBX_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.sandbox.id)" "${CREATE_RESPONSE}")"
echo "created ${SBX_ID}"

RUN_PAYLOAD="$(node -e "console.log(JSON.stringify({command:'python agent.py', stdin: require('fs').readFileSync('agent.py', 'utf8')}))")"
RUN_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "${RUN_PAYLOAD}" \
  "${API_URL}/v1/sandboxes/${SBX_ID}/run")"
echo "${RUN_RESPONSE}"
node -e "const r=JSON.parse(process.argv[1]); if (r.result.exitCode !== 0) { console.error(r.result.stderr); process.exit(1); }" "${RUN_RESPONSE}"

curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}"
echo "smoke passed"
