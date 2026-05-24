#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
KUBECONFIG_PATH="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
NAME="${HARAKIRI_AUDIT_SMOKE_NAME:-audit-smoke-$(date +%s)}"
ALIAS="${NAME}-stable"
TEMP_KEY=0
SANDBOX_ID=""

cleanup() {
  set +e
  if [[ -n "${SANDBOX_ID}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${HARAKIRI_API_KEY}" \
      "${API_URL}/v1/sandboxes/${SANDBOX_ID}" >/dev/null 2>&1 || true
  fi
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" \
      "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
  local pgpod
  pgpod="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)"
  if [[ -n "${pgpod}" ]]; then
    if [[ -n "${SANDBOX_ID}" ]]; then
      kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${pgpod}" -- \
        psql -U harakiri -d harakiri -qAtc "delete from sandboxes where id = '${SANDBOX_ID}';" >/dev/null 2>&1 || true
    fi
    kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${pgpod}" -- \
      psql -U harakiri -d harakiri -qAtc "delete from templates where id = '${NAME}';" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi

CREATE_RESPONSE="$(curl -fsS \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d "{\"id\":\"${NAME}\",\"name\":\"${NAME}\",\"image\":\"ubuntu:24.04\",\"aliases\":[\"${NAME}\"],\"visibility\":\"private\",\"cpuCount\":1,\"memoryMb\":512}" \
  "${API_URL}/v1/templates")"
printf '%s\n' "${CREATE_RESPONSE}"
VERSION_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.template.latestVersionId)" "${CREATE_RESPONSE}")"
if [[ -z "${VERSION_ID}" || "${VERSION_ID}" == "null" ]]; then
  echo "template audit smoke failed: template create did not return latestVersionId" >&2
  exit 1
fi
TEMPLATE_GET_RESPONSE="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" \
  "${API_URL}/v1/templates/${NAME}")"
TEMPLATE_GET_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.template.id)" "${TEMPLATE_GET_RESPONSE}")"
if [[ "${TEMPLATE_GET_ID}" != "${NAME}" ]]; then
  echo "template audit smoke failed: template get returned ${TEMPLATE_GET_ID}" >&2
  exit 1
fi

VERSIONS_RESPONSE="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" \
  "${API_URL}/v1/templates/${NAME}/versions")"
VERSION_PRESENT="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.versions.some(v => v.id === process.argv[2]) ? '1' : '0')" "${VERSIONS_RESPONSE}" "${VERSION_ID}")"
if [[ "${VERSION_PRESENT}" != "1" ]]; then
  echo "template audit smoke failed: template versions did not include ${VERSION_ID}" >&2
  exit 1
fi

SANDBOX_RESPONSE="$(curl -fsS \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d "{\"template\":\"${VERSION_ID}\",\"name\":\"runtime-${NAME}\",\"ttlSeconds\":90}" \
  "${API_URL}/v1/sandboxes")"
printf '%s\n' "${SANDBOX_RESPONSE}"
SANDBOX_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.sandbox.id)" "${SANDBOX_RESPONSE}")"
if [[ -z "${SANDBOX_ID}" ]]; then
  echo "template audit smoke failed: sandbox create by template version did not return sandbox id" >&2
  exit 1
fi
SANDBOX_TEMPLATE_VERSION="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.sandbox.templateVersionId)" "${SANDBOX_RESPONSE}")"
if [[ "${SANDBOX_TEMPLATE_VERSION}" != "${VERSION_ID}" ]]; then
  echo "template audit smoke failed: sandbox did not persist immutable template version ${VERSION_ID}: ${SANDBOX_TEMPLATE_VERSION}" >&2
  exit 1
fi

BUILD_RESPONSE="$(curl -fsS \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d '{"sourceType":"dockerfile","dockerfilePath":"Dockerfile","metadata":{"auditSmoke":true}}' \
  "${API_URL}/v1/templates/${NAME}/builds")"
printf '%s\n' "${BUILD_RESPONSE}"
BUILD_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.build.id)" "${BUILD_RESPONSE}")"
if [[ -z "${BUILD_ID}" ]]; then
  echo "template audit smoke failed: build create did not return build id" >&2
  exit 1
fi

CANCEL_RESPONSE="$(curl -fsS -X POST -H "x-api-key: ${HARAKIRI_API_KEY}" \
  "${API_URL}/v1/template-builds/${BUILD_ID}/cancel")"
CANCELED_STATUS="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.build.status)" "${CANCEL_RESPONSE}")"
if [[ "${CANCELED_STATUS}" != "canceled" ]]; then
  echo "template audit smoke failed: build cancel did not return canceled status" >&2
  exit 1
fi

BUILD_GET_RESPONSE="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" \
  "${API_URL}/v1/template-builds/${BUILD_ID}")"
BUILD_GET_STATUS="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.build.status)" "${BUILD_GET_RESPONSE}")"
if [[ "${BUILD_GET_STATUS}" != "canceled" ]]; then
  echo "template audit smoke failed: build get did not return canceled status" >&2
  exit 1
fi

BUILD_LIST_RESPONSE="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" \
  "${API_URL}/v1/template-builds?q=${BUILD_ID}&template=${NAME}")"
BUILD_LIST_COUNT="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.builds.filter(b => b.id === process.argv[2]).length)" "${BUILD_LIST_RESPONSE}" "${BUILD_ID}")"
if [[ "${BUILD_LIST_COUNT}" != "1" ]]; then
  echo "template audit smoke failed: build list did not include ${BUILD_ID}" >&2
  exit 1
fi

BUILD_LOGS_RESPONSE="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" \
  "${API_URL}/v1/template-builds/${BUILD_ID}/logs")"
BUILD_LOGS_IS_ARRAY="$(node -e "const r=JSON.parse(process.argv[1]); console.log(Array.isArray(r.logs) ? '1' : '0')" "${BUILD_LOGS_RESPONSE}")"
if [[ "${BUILD_LOGS_IS_ARRAY}" != "1" ]]; then
  echo "template audit smoke failed: build logs response is not an array" >&2
  exit 1
fi

PROMOTE_RESPONSE="$(curl -fsS -X POST \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d "{\"versionId\":\"${VERSION_ID}\",\"alias\":\"${ALIAS}\"}" \
  "${API_URL}/v1/templates/${NAME}/promote")"
PROMOTED_VERSION="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.template.latestVersionId)" "${PROMOTE_RESPONSE}")"
if [[ "${PROMOTED_VERSION}" != "${VERSION_ID}" ]]; then
  echo "template audit smoke failed: promote did not return version ${VERSION_ID}" >&2
  exit 1
fi

ALIAS_RESPONSE="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" \
  "${API_URL}/v1/templates/${ALIAS}")"
ALIAS_VERSION="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.template.latestVersionId)" "${ALIAS_RESPONSE}")"
if [[ "${ALIAS_VERSION}" != "${VERSION_ID}" ]]; then
  echo "template audit smoke failed: promoted alias did not resolve to ${VERSION_ID}" >&2
  exit 1
fi

curl -fsS -X POST -H "x-api-key: ${HARAKIRI_API_KEY}" \
  "${API_URL}/v1/templates/${NAME}/archive" >/dev/null

ARCHIVED_RESPONSE="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" \
  "${API_URL}/v1/templates?q=${NAME}&status=archived")"
ARCHIVED_COUNT="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.templates.length)" "${ARCHIVED_RESPONSE}")"
if [[ "${ARCHIVED_COUNT}" != "1" ]]; then
  echo "template audit smoke failed: archived template is not visible with status=archived" >&2
  exit 1
fi

ACTIVE_RESPONSE="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" \
  "${API_URL}/v1/templates?q=${NAME}")"
ACTIVE_COUNT="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.templates.length)" "${ACTIVE_RESPONSE}")"
if [[ "${ACTIVE_COUNT}" != "0" ]]; then
  echo "template audit smoke failed: archived template is visible in default active list" >&2
  exit 1
fi

CREATE_ARCHIVED_RESPONSE="$(curl -sS -w '\n%{http_code}' \
  -H "x-api-key: ${HARAKIRI_API_KEY}" \
  -H "content-type: application/json" \
  -d "{\"template\":\"${NAME}\",\"name\":\"after-archive-${NAME}\",\"ttlSeconds\":90}" \
  "${API_URL}/v1/sandboxes")"
CREATE_ARCHIVED_STATUS="$(printf '%s\n' "${CREATE_ARCHIVED_RESPONSE}" | tail -1)"
CREATE_ARCHIVED_BODY="$(printf '%s\n' "${CREATE_ARCHIVED_RESPONSE}" | sed '$d')"
printf '%s\n' "${CREATE_ARCHIVED_BODY}"
if [[ "${CREATE_ARCHIVED_STATUS}" != "404" ]] || ! grep -q "template_not_found" <<<"${CREATE_ARCHIVED_BODY}"; then
  echo "template audit smoke failed: archived template could still create a sandbox" >&2
  exit 1
fi

PGPOD="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}')"
AUDIT_ACTIONS="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${PGPOD}" -- \
  psql -U harakiri -d harakiri -qAtc "select action from audit_events where target_id in ('${NAME}', '${BUILD_ID}', '${SANDBOX_ID}') or metadata->>'buildId' = '${BUILD_ID}' or metadata->>'templateVersionId' = '${VERSION_ID}' order by created_at;")"
printf '%s\n' "${AUDIT_ACTIONS}"
for action in template.create template.build.create template.build.cancel template.promote template.archive sandbox.create; do
  if ! grep -qx "${action}" <<<"${AUDIT_ACTIONS}"; then
    echo "template audit smoke failed: missing audit action ${action}" >&2
    exit 1
  fi
done

echo "template audit smoke passed: ${NAME} ${BUILD_ID} ${SANDBOX_ID}"
