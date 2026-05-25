#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
KUBECONFIG_PATH="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
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

curl -fsS "${API_URL}/health" >/dev/null

CREATE_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d '{"template":"python-3.12","name":"renew-smoke","ttlSeconds":60}' \
  "${API_URL}/v1/sandboxes")"
SBX_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.sandbox.id)" "${CREATE_RESPONSE}")"
echo "created ${SBX_ID}"

PGPOD="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}')"
BEFORE_EXPIRES="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${PGPOD}" -- \
  psql -U harakiri -d harakiri -qAtc "select extract(epoch from expires_at)::bigint from sandboxes where id = '${SBX_ID}';")"
if [[ -z "${BEFORE_EXPIRES}" ]]; then
  echo "renew smoke failed: missing initial expires_at for ${SBX_ID}" >&2
  exit 1
fi

sleep 2
RENEW_RESPONSE="$(curl -fsS -X POST -H "x-api-key: ${KEY}" -H "Idempotency-Key: renew-smoke-${SBX_ID}" \
  "${API_URL}/v1/sandboxes/${SBX_ID}/renew")"
node -e "const r=JSON.parse(process.argv[1]); if (r.ok !== true) process.exit(1)" "${RENEW_RESPONSE}"

AFTER_STATE="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${PGPOD}" -- \
  psql -U harakiri -d harakiri -qAtc "select extract(epoch from expires_at)::bigint || '|' || coalesce((select state from sandbox_operations where sandbox_id = '${SBX_ID}' and kind = 'renew' order by created_at desc limit 1), '') || '|' || coalesce((select result->>'providerSandboxId' from sandbox_operations where sandbox_id = '${SBX_ID}' and kind = 'renew' order by created_at desc limit 1), '') || '|' || coalesce((select type from sandbox_events where sandbox_id = '${SBX_ID}' and type = 'renewed' order by created_at desc limit 1), '') from sandboxes where id = '${SBX_ID}';")"
IFS='|' read -r AFTER_EXPIRES OPERATION_STATE PROVIDER_SANDBOX EVENT_TYPE <<<"${AFTER_STATE}"
if [[ -z "${AFTER_EXPIRES}" || "${AFTER_EXPIRES}" -le "${BEFORE_EXPIRES}" ]]; then
  echo "renew smoke failed: expires_at did not move forward (${BEFORE_EXPIRES} -> ${AFTER_EXPIRES})" >&2
  exit 1
fi
if [[ "${OPERATION_STATE}" != "succeeded" || -z "${PROVIDER_SANDBOX}" || "${EVENT_TYPE}" != "renewed" ]]; then
  echo "renew smoke failed: unexpected operation/event state: ${AFTER_STATE}" >&2
  exit 1
fi

RUN_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d '{"command":"python --version"}' \
  "${API_URL}/v1/sandboxes/${SBX_ID}/run")"
node -e "const r=JSON.parse(process.argv[1]); if (r.result.exitCode !== 0) { console.error(r.result.stderr); process.exit(1); }" "${RUN_RESPONSE}"

echo "renew smoke passed: ${SBX_ID}"
