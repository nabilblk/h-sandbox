#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
KUBECONFIG_PATH="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
NAME="${HARAKIRI_IMAGE_POLICY_SMOKE_NAME:-image-policy-smoke-$(date +%s)}"
TEMP_KEY=0
CONTEXT_DIR=""
ARCHIVE=""

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
      psql -U harakiri -d harakiri -qAtc "delete from templates where id like '${NAME}%';" >/dev/null 2>&1 || true
  fi
  [[ -n "${CONTEXT_DIR}" ]] && rm -rf "${CONTEXT_DIR}"
  [[ -n "${ARCHIVE}" ]] && rm -f "${ARCHIVE}"
}
trap cleanup EXIT

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi

DENIED_IMAGE="localhost:5001/blocked/runtime:latest"
CREATE_RESPONSE="$(curl -sS -w '\n%{http_code}' \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d "{\"id\":\"${NAME}-denied\",\"name\":\"${NAME}-denied\",\"image\":\"${DENIED_IMAGE}\"}" \
  "${API_URL}/v1/templates")"
CREATE_STATUS="$(printf '%s\n' "${CREATE_RESPONSE}" | tail -1)"
CREATE_BODY="$(printf '%s\n' "${CREATE_RESPONSE}" | sed '$d')"
printf '%s\n' "${CREATE_BODY}"
if [[ "${CREATE_STATUS}" != "422" ]] || ! grep -q "template_image_policy_violation" <<<"${CREATE_BODY}"; then
  echo "template image policy smoke failed: denied template image was not rejected" >&2
  exit 1
fi

curl -fsS \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d "{\"id\":\"${NAME}\",\"name\":\"${NAME}\",\"image\":\"ubuntu:24.04\",\"aliases\":[\"${NAME}\"],\"visibility\":\"private\",\"cpuCount\":1,\"memoryMb\":512}" \
  "${API_URL}/v1/templates" >/dev/null

BUILD_RESPONSE="$(curl -fsS \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d '{"sourceType":"dockerfile","dockerfilePath":"Dockerfile","metadata":{"imagePolicySmoke":true}}' \
  "${API_URL}/v1/templates/${NAME}/builds")"
BUILD_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.build.id)" "${BUILD_RESPONSE}")"

CONTEXT_DIR="$(mktemp -d /tmp/harakiri-image-policy.XXXXXX)"
ARCHIVE="$(mktemp /tmp/harakiri-image-policy.XXXXXX.tar.gz)"
cat >"${CONTEXT_DIR}/Dockerfile" <<DOCKERFILE
FROM ${DENIED_IMAGE}
CMD ["sleep", "3600"]
DOCKERFILE
tar -czf "${ARCHIVE}" -C "${CONTEXT_DIR}" Dockerfile
SIZE_BYTES="$(wc -c <"${ARCHIVE}" | tr -d ' ')"
SHA256="sha256:$(shasum -a 256 "${ARCHIVE}" | awk '{print $1}')"
ARCHIVE_BASE64="$(base64 <"${ARCHIVE}" | tr -d '\n')"

CONTEXT_RESPONSE="$(curl -sS -w '\n%{http_code}' \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d "{\"format\":\"tar+gzip\",\"archiveBase64\":\"${ARCHIVE_BASE64}\",\"sha256\":\"${SHA256}\",\"sizeBytes\":${SIZE_BYTES},\"fileCount\":1}" \
  "${API_URL}/v1/template-builds/${BUILD_ID}/context")"
CONTEXT_STATUS="$(printf '%s\n' "${CONTEXT_RESPONSE}" | tail -1)"
CONTEXT_BODY="$(printf '%s\n' "${CONTEXT_RESPONSE}" | sed '$d')"
printf '%s\n' "${CONTEXT_BODY}"
if [[ "${CONTEXT_STATUS}" != "422" ]] || ! grep -q "template_image_policy_violation" <<<"${CONTEXT_BODY}"; then
  echo "template image policy smoke failed: denied Dockerfile FROM was not rejected" >&2
  exit 1
fi
if ! grep -q "registry_not_allowed" <<<"${CONTEXT_BODY}"; then
  echo "template image policy smoke failed: context response did not explain registry policy" >&2
  exit 1
fi

echo "template image policy smoke passed: ${BUILD_ID}"
