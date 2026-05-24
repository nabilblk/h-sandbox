#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
KUBECONFIG_PATH="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
NAME="${HARAKIRI_REDACTION_SMOKE_NAME:-redaction-smoke-$(date +%s)}"
TEMP_KEY=0

cleanup() {
  set +e
  if [[ -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" \
      "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1
  fi
  local pgpod
  pgpod="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)"
  if [[ -n "${pgpod}" ]]; then
    kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${pgpod}" -- \
      psql -U harakiri -d harakiri -qAtc "delete from templates where id = '${NAME}';" >/dev/null 2>&1
  fi
}
trap cleanup EXIT

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi

curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" -H "content-type: application/json" \
  -d "{\"id\":\"${NAME}\",\"name\":\"${NAME}\",\"image\":\"ubuntu:24.04\",\"aliases\":[\"${NAME}\"],\"visibility\":\"private\"}" \
  "${API_URL}/v1/templates" >/dev/null

BUILD_RESPONSE="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" -H "content-type: application/json" \
  -d '{"sourceType":"image","imageDestination":"ubuntu:24.04","buildArgs":{"normal":"value","registry_password":"super-secret"},"metadata":{"apiToken":"hk_test_should_not_survive","command":"curl -H '\''x-api-key: hk_test_nested'\'' https://example.test"}}' \
  "${API_URL}/v1/templates/${NAME}/builds")"
printf '%s\n' "${BUILD_RESPONSE}"
BUILD_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.build.id)" "${BUILD_RESPONSE}")"

if grep -qE 'super-secret|hk_test_should_not_survive|hk_test_nested' <<<"${BUILD_RESPONSE}"; then
  echo "redaction smoke failed: build create response leaked a secret" >&2
  exit 1
fi
if ! grep -q '\[redacted\]' <<<"${BUILD_RESPONSE}"; then
  echo "redaction smoke failed: build create response did not include redaction marker" >&2
  exit 1
fi

GET_RESPONSE="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" "${API_URL}/v1/template-builds/${BUILD_ID}")"
printf '%s\n' "${GET_RESPONSE}"
if grep -qE 'super-secret|hk_test_should_not_survive|hk_test_nested' <<<"${GET_RESPONSE}"; then
  echo "redaction smoke failed: build get response leaked a secret" >&2
  exit 1
fi

PGPOD="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}')"
STORED="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${PGPOD}" -- \
  psql -U harakiri -d harakiri -qAtc "select build_args::text || ' ' || metadata::text from template_builds where id = '${BUILD_ID}';")"
printf '%s\n' "${STORED}"
if grep -qE 'super-secret|hk_test_should_not_survive|hk_test_nested' <<<"${STORED}"; then
  echo "redaction smoke failed: PostgreSQL retained a secret" >&2
  exit 1
fi
if ! grep -q '\[redacted\]' <<<"${STORED}"; then
  echo "redaction smoke failed: PostgreSQL row did not include redaction marker" >&2
  exit 1
fi

echo "template redaction smoke passed: ${BUILD_ID}"
