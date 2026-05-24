#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
CLI="${HARAKIRI_CLI:-${ROOT}/packages/cli/dist/index.js}"
NAME="${HARAKIRI_TEMPLATE_SMOKE_NAME:-kaniko-smoke-$(date +%s)}"
BUILD_TIMEOUT_SECONDS="${HARAKIRI_TEMPLATE_BUILD_TIMEOUT_SECONDS:-300}"
KUBECONFIG_PATH="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
SANDBOX_ID=""
HARAKIRI_API_KEY_ID="${HARAKIRI_API_KEY_ID:-}"
CONTEXT_DIR=""
CLI_HOME=""

cleanup() {
  set +e
  if [[ -n "${SANDBOX_ID}" ]]; then
    HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
      node "${CLI}" kill "${SANDBOX_ID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${HARAKIRI_API_KEY_ID}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${HARAKIRI_API_KEY}" \
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
  [[ -n "${CONTEXT_DIR}" ]] && rm -rf "${CONTEXT_DIR}"
  [[ -n "${CLI_HOME}" ]] && rm -rf "${CLI_HOME}"
}
trap cleanup EXIT

if [[ ! -x "${CLI}" ]]; then
  pnpm --dir "${ROOT}" --filter @harakiri/cli build
fi

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
fi

CONTEXT_DIR="$(mktemp -d /tmp/harakiri-template-smoke.XXXXXX)"
CLI_HOME="$(mktemp -d /tmp/harakiri-cli-home.XXXXXX)"

cat >"${CONTEXT_DIR}/Dockerfile" <<'DOCKERFILE'
FROM ubuntu:24.04
RUN echo harakiri-built > /harakiri-built.txt
CMD ["sleep", "3600"]
DOCKERFILE

BUILD_OUTPUT="$(HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
  node "${CLI}" template build "${CONTEXT_DIR}" --name "${NAME}" --dockerfile Dockerfile --timeout "${BUILD_TIMEOUT_SECONDS}")"
printf '%s\n' "${BUILD_OUTPUT}"
BUILD_ID="$(printf '%s\n' "${BUILD_OUTPUT}" | awk '/^bld_/ {print $1}' | tail -1)"
if [[ -z "${BUILD_ID}" ]]; then
  echo "template build did not print a build id" >&2
  exit 1
fi
if ! grep -q -- "-> success. build=${BUILD_ID}" <<<"${BUILD_OUTPUT}"; then
  echo "template build ${BUILD_ID} did not report success" >&2
  exit 1
fi
if ! grep -q -- "-> image=sha256:" <<<"${BUILD_OUTPUT}"; then
  echo "template build ${BUILD_ID} did not print an image digest" >&2
  exit 1
fi
VERSION_ID="$(printf '%s\n' "${BUILD_OUTPUT}" | awk -F= '/^-> version=/ {print $2}' | tail -1)"
if [[ -z "${VERSION_ID}" ]]; then
  echo "template build ${BUILD_ID} did not print a template version id" >&2
  exit 1
fi

CREATE_OUTPUT="$(HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
  node "${CLI}" create --template "${NAME}" --name "runtime-${NAME}")"
printf '%s\n' "${CREATE_OUTPUT}"
SANDBOX_ID="$(printf '%s\n' "${CREATE_OUTPUT}" | awk '/^sbx_/ {print $1}' | tail -1)"
if [[ -z "${SANDBOX_ID}" ]]; then
  echo "template sandbox create did not print a sandbox id" >&2
  exit 1
fi

RUN_OUTPUT="$(HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
  node "${CLI}" run "${SANDBOX_ID}" --cmd "cat /harakiri-built.txt")"
printf '%s\n' "${RUN_OUTPUT}"
if ! grep -q "harakiri-built" <<<"${RUN_OUTPUT}"; then
  echo "sandbox did not run the built image content" >&2
  exit 1
fi

PGPOD="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}')"
VERSION_SECURITY="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${PGPOD}" -- \
  psql -U harakiri -d harakiri -qAtc "select scan_status || '|' || coalesce(provenance->>'buildId', '') || '|' || coalesce(scan_summary->>'reason', '') from template_versions where build_id = '${BUILD_ID}' order by created_at desc limit 1;")"
if [[ "${VERSION_SECURITY}" != "not_scanned|${BUILD_ID}|scanner_not_configured" ]]; then
  echo "template version security fields were not populated for ${BUILD_ID}: ${VERSION_SECURITY}" >&2
  exit 1
fi
BUILD_AUDIT_COUNT="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${PGPOD}" -- \
  psql -U harakiri -d harakiri -qAtc "select count(*) from audit_events where action = 'template.build.success' and target_id = '${BUILD_ID}' and metadata->>'versionId' = '${VERSION_ID}';")"
if [[ "${BUILD_AUDIT_COUNT}" != "1" ]]; then
  echo "template build success audit event missing for ${BUILD_ID}/${VERSION_ID}: ${BUILD_AUDIT_COUNT}" >&2
  exit 1
fi
BUILDER_RUNTIME="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${PGPOD}" -- \
  psql -U harakiri -d harakiri -qAtc "select coalesce(metadata->>'builderJobName', '') || '|' || coalesce(metadata->>'builderPodName', '') || '|' || coalesce(metadata->>'builderNodeName', '') from template_builds where id = '${BUILD_ID}';")"
IFS='|' read -r BUILDER_JOB BUILDER_POD BUILDER_NODE <<<"${BUILDER_RUNTIME}"
if [[ -z "${BUILDER_JOB}" || -z "${BUILDER_POD}" || -z "${BUILDER_NODE}" ]]; then
  echo "template build metadata missing builder job/pod/node for ${BUILD_ID}: ${BUILDER_RUNTIME}" >&2
  exit 1
fi

echo "template build smoke passed: ${BUILD_ID} ${SANDBOX_ID}"
