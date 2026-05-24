#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export KUBECONFIG="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
PF_PID=""
TEMP_KEY=0
SANDBOX_ID=""

cleanup() {
  set +e
  if [[ -n "${SANDBOX_ID}" && -n "${HARAKIRI_API_KEY:-}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${HARAKIRI_API_KEY}" "${API_URL}/v1/sandboxes/${SANDBOX_ID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${PF_PID}" ]]; then
    kill "${PF_PID}" >/dev/null 2>&1 || true
  fi
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if ! curl -fsS "${API_URL}/health" >/dev/null 2>&1; then
  kubectl -n harakiri port-forward svc/harakiri-api 18082:8080 >/tmp/harakiri-api-pf.log 2>&1 &
  PF_PID=$!
  sleep 3
fi

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi

CREATE_RESPONSE="$(curl -fsS \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d '{"template":"python-3.12-data","name":"env-smoke","ttlSeconds":90,"env":{"HARAKIRI_ENV_SMOKE":"env-ok"}}' \
  "${API_URL}/v1/sandboxes")"
SANDBOX_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.sandbox.id)" "${CREATE_RESPONSE}")"
echo "created ${SANDBOX_ID}"

RUN_PAYLOAD="{\"command\":\"python -c 'import os; print(os.getenv(\\\"HARAKIRI_ENV_SMOKE\\\", \\\"missing\\\"))'\"}"
RUN_RESPONSE="$(curl -fsS \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d "${RUN_PAYLOAD}" \
  "${API_URL}/v1/sandboxes/${SANDBOX_ID}/run")"
printf '%s\n' "${RUN_RESPONSE}"
STDOUT="$(node -e "const r=JSON.parse(process.argv[1]); process.stdout.write(String(r.result.stdout || '').trim())" "${RUN_RESPONSE}")"
if [[ "${STDOUT}" != "env-ok" ]]; then
  echo "sandbox env smoke failed: expected env-ok, got ${STDOUT}" >&2
  exit 1
fi

PGPOD="$(kubectl -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}')"
EVENT_STATE="$(kubectl -n harakiri exec "${PGPOD}" -- \
  psql -U harakiri -d harakiri -qAtc "select coalesce((metadata->'envKeys' ? 'HARAKIRI_ENV_SMOKE')::text, 'false') || '|' || coalesce(metadata->>'runtimeWorkdir', '') from sandbox_events where sandbox_id = '${SANDBOX_ID}' and type = 'created' order by created_at desc limit 1;")"
IFS='|' read -r ENV_KEY_RECORDED RUNTIME_WORKDIR <<<"${EVENT_STATE}"
if [[ "${ENV_KEY_RECORDED}" != "true" || -z "${RUNTIME_WORKDIR}" ]]; then
  echo "sandbox env smoke failed: event metadata did not record env key/workdir: ${EVENT_STATE}" >&2
  exit 1
fi

echo "sandbox env smoke passed: ${SANDBOX_ID}"
