#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
NAME="${HARAKIRI_TEMPLATE_PREPULL_SMOKE_NAME:-prepull-smoke-$(date +%s)}"
BUILD_TIMEOUT_SECONDS="${HARAKIRI_TEMPLATE_PREPULL_TIMEOUT_SECONDS:-180}"
KUBECONFIG_PATH="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
HARAKIRI_API_KEY_ID="${HARAKIRI_API_KEY_ID:-}"
BUILD_ID=""

cleanup() {
  set +e
  if [[ -n "${HARAKIRI_API_KEY_ID}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${HARAKIRI_API_KEY}" \
      "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
  local pgpod
  pgpod="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)"
  if [[ -n "${pgpod}" ]]; then
    kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${pgpod}" -- \
      psql -U harakiri -d harakiri -qAtc "delete from templates where id = '${NAME}';" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
fi

api() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"
  if [[ -n "${payload}" ]]; then
    curl -fsS -X "${method}" -H "x-api-key: ${HARAKIRI_API_KEY}" -H "content-type: application/json" \
      -d "${payload}" "${API_URL}${path}"
  else
    curl -fsS -X "${method}" -H "x-api-key: ${HARAKIRI_API_KEY}" "${API_URL}${path}"
  fi
}

CREATE_PAYLOAD="$(node -e 'const name=process.argv[1]; process.stdout.write(JSON.stringify({id:name,name,description:"Hot template pre-pull smoke.",image:"ubuntu:24.04",tags:["custom","hot"],aliases:[name],visibility:"private",defaultEntrypoint:["sleep","3600"],cpuCount:1,memoryMb:512,workdir:"/workspace",defaultPorts:[8000],runtimeFamily:"linux"}));' "${NAME}")"
api POST "/v1/templates" "${CREATE_PAYLOAD}" >/dev/null

BUILD_PAYLOAD='{"sourceType":"image","imageDestination":"ubuntu:24.04","metadata":{"prepullSmoke":true}}'
BUILD_RESPONSE="$(api POST "/v1/templates/${NAME}/builds" "${BUILD_PAYLOAD}")"
BUILD_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.build.id)" "${BUILD_RESPONSE}")"
echo "queued hot template image-import build ${BUILD_ID}"

deadline=$((SECONDS + BUILD_TIMEOUT_SECONDS))
BUILD_STATUS=""
BUILD_JSON=""
while (( SECONDS < deadline )); do
  BUILD_JSON="$(api GET "/v1/template-builds/${BUILD_ID}")"
  BUILD_STATUS="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.build.status)" "${BUILD_JSON}")"
  echo "build ${BUILD_ID}: ${BUILD_STATUS}"
  case "${BUILD_STATUS}" in
    success|failed|canceled) break ;;
  esac
  sleep 2
done

if [[ "${BUILD_STATUS}" != "success" ]]; then
  api GET "/v1/template-builds/${BUILD_ID}/logs" || true
  echo "template pre-pull smoke build did not succeed: ${BUILD_STATUS}" >&2
  exit 1
fi

PREPULL_STATE="$(node -e '
const r = JSON.parse(process.argv[1]);
const p = r.build.metadata?.runtimeImagePrepull ?? {};
console.log([p.status ?? "", p.namespace ?? "", Array.isArray(p.nodeNames) ? p.nodeNames.length : 0, Array.isArray(p.podNames) ? p.podNames.length : 0, p.reason ?? ""].join("|"));
' "${BUILD_JSON}")"
IFS='|' read -r PREPULL_STATUS PREPULL_NAMESPACE PREPULL_NODE_COUNT PREPULL_POD_COUNT PREPULL_REASON <<<"${PREPULL_STATE}"

if [[ "${PREPULL_STATUS}" != "ok" || "${PREPULL_NAMESPACE}" != "opensandbox" || "${PREPULL_NODE_COUNT}" -lt 1 || "${PREPULL_POD_COUNT}" -lt 1 ]]; then
  echo "runtime image pre-pull metadata unexpected for ${BUILD_ID}: ${PREPULL_STATE}" >&2
  exit 1
fi

echo "template pre-pull smoke passed: ${BUILD_ID} nodes=${PREPULL_NODE_COUNT} pods=${PREPULL_POD_COUNT}"
