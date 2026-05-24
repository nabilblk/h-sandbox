#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
KUBECONFIG_PATH="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
NAME="${HARAKIRI_LIMITS_SMOKE_NAME:-limits-smoke-$(date +%s)}"
CPU_LIMIT="${HARAKIRI_TEMPLATE_MAX_CPU_COUNT:-8}"
BUILD_LIMIT="${HARAKIRI_TEMPLATE_BUILD_MAX_ACTIVE_PER_ORG:-3}"
TEMP_KEY=0

cleanup() {
  set +e
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" \
      "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1
  fi
  local pgpod
  pgpod="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)"
  if [[ -n "${pgpod}" ]]; then
    kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${pgpod}" -- \
      psql -U harakiri -d harakiri -qAtc "delete from templates where id like '${NAME}%';" >/dev/null 2>&1
  fi
}
trap cleanup EXIT

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi

if [[ "${TEMP_KEY}" == "0" ]]; then
  echo "using provided HARAKIRI_API_KEY"
fi

OVER_LIMIT_CPU=$((CPU_LIMIT + 1))
RESOURCE_RESPONSE="$(curl -sS -w '\n%{http_code}' \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d "{\"id\":\"${NAME}-too-large\",\"name\":\"${NAME}-too-large\",\"image\":\"ubuntu:24.04\",\"cpuCount\":${OVER_LIMIT_CPU}}" \
  "${API_URL}/v1/templates")"
RESOURCE_STATUS="$(printf '%s\n' "${RESOURCE_RESPONSE}" | tail -1)"
RESOURCE_BODY="$(printf '%s\n' "${RESOURCE_RESPONSE}" | sed '$d')"
printf '%s\n' "${RESOURCE_BODY}"
if [[ "${RESOURCE_STATUS}" != "422" ]]; then
  echo "template limits smoke failed: expected 422 for over-limit template, got ${RESOURCE_STATUS}" >&2
  exit 1
fi
if ! grep -q "template_resource_limit_exceeded" <<<"${RESOURCE_BODY}"; then
  echo "template limits smoke failed: resource limit response missing expected error" >&2
  exit 1
fi

curl -fsS \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d "{\"id\":\"${NAME}\",\"name\":\"${NAME}\",\"image\":\"ubuntu:24.04\",\"aliases\":[\"${NAME}\"],\"visibility\":\"private\",\"cpuCount\":1,\"memoryMb\":512}" \
  "${API_URL}/v1/templates" >/dev/null

for index in $(seq 1 "${BUILD_LIMIT}"); do
  BUILD_RESPONSE="$(curl -fsS \
    -H "x-api-key: ${HARAKIRI_API_KEY}" \
    -H "content-type: application/json" \
    -d "{\"sourceType\":\"dockerfile\",\"dockerfilePath\":\"Dockerfile\",\"metadata\":{\"limitsSmoke\":true,\"index\":${index}}}" \
    "${API_URL}/v1/templates/${NAME}/builds")"
  printf '%s\n' "${BUILD_RESPONSE}"
  BUILD_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.build.id)" "${BUILD_RESPONSE}")"
  BUILD_STATUS="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.build.status)" "${BUILD_RESPONSE}")"
  if [[ -z "${BUILD_ID}" || "${BUILD_STATUS}" != "queued" ]]; then
    echo "template limits smoke failed: expected queued build ${index}" >&2
    exit 1
  fi
done

LIMIT_RESPONSE="$(curl -sS -w '\n%{http_code}' \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d '{"sourceType":"dockerfile","dockerfilePath":"Dockerfile","metadata":{"limitsSmoke":true,"index":"limit"}}' \
  "${API_URL}/v1/templates/${NAME}/builds")"
LIMIT_STATUS="$(printf '%s\n' "${LIMIT_RESPONSE}" | tail -1)"
LIMIT_BODY="$(printf '%s\n' "${LIMIT_RESPONSE}" | sed '$d')"
printf '%s\n' "${LIMIT_BODY}"
if [[ "${LIMIT_STATUS}" != "429" ]]; then
  echo "template limits smoke failed: expected 429 after ${BUILD_LIMIT} active builds, got ${LIMIT_STATUS}" >&2
  exit 1
fi
if ! grep -q "template_build_concurrency_limit_exceeded" <<<"${LIMIT_BODY}"; then
  echo "template limits smoke failed: concurrency response missing expected error" >&2
  exit 1
fi

echo "template limits smoke passed: resource limit ${CPU_LIMIT} CPU, active build limit ${BUILD_LIMIT}"
