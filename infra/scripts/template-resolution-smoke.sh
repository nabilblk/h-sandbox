#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
CLI="${HARAKIRI_CLI:-${ROOT}/packages/cli/dist/index.js}"
NAME="${HARAKIRI_TEMPLATE_RESOLUTION_SMOKE_NAME:-resolution-smoke-$(date +%s)}"
BUILD_TIMEOUT_SECONDS="${HARAKIRI_TEMPLATE_RESOLUTION_TIMEOUT_SECONDS:-180}"
KUBECONFIG_PATH="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
HARAKIRI_API_KEY_ID="${HARAKIRI_API_KEY_ID:-}"
HARAKIRI_API_KEY="${HARAKIRI_API_KEY:-}"
CLI_HOME=""
SANDBOX_IDS=()

cleanup() {
  set +e
  for sandbox_id in "${SANDBOX_IDS[@]}"; do
    HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
      node "${CLI}" kill "${sandbox_id}" >/dev/null 2>&1 || true
  done
  if [[ -n "${HARAKIRI_API_KEY_ID}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${HARAKIRI_API_KEY}" \
      "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
  local pgpod
  pgpod="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)"
  if [[ -n "${pgpod}" ]]; then
    for sandbox_id in "${SANDBOX_IDS[@]}"; do
      kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${pgpod}" -- \
        psql -U harakiri -d harakiri -qAtc "delete from sandboxes where id = '${sandbox_id}';" >/dev/null 2>&1 || true
    done
    kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${pgpod}" -- \
      psql -U harakiri -d harakiri -qAtc "delete from templates where id = '${NAME}';" >/dev/null 2>&1 || true
  fi
  [[ -n "${CLI_HOME}" ]] && rm -rf "${CLI_HOME}"
}
trap cleanup EXIT

if [[ ! -x "${CLI}" ]]; then
  pnpm --dir "${ROOT}" --filter @harakiri/cli build
fi

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
fi

CLI_HOME="$(mktemp -d /tmp/harakiri-cli-home.XXXXXX)"

BUILD_OUTPUT="$(HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
  node "${CLI}" template build --name "${NAME}" --source image --image ubuntu:24.04 --timeout "${BUILD_TIMEOUT_SECONDS}")"
printf '%s\n' "${BUILD_OUTPUT}"
BUILD_ID="$(printf '%s\n' "${BUILD_OUTPUT}" | awk '/^bld_/ {print $1}' | tail -1)"
VERSION_ID="$(printf '%s\n' "${BUILD_OUTPUT}" | awk -F= '/^-> version=/ {print $2}' | tail -1)"
if [[ -z "${BUILD_ID}" || -z "${VERSION_ID}" ]]; then
  echo "template resolution smoke did not produce build and version ids" >&2
  exit 1
fi

PROMOTE_OUTPUT="$(HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
  node "${CLI}" template promote "${NAME}" --version-id "${VERSION_ID}" --alias stable)"
printf '%s\n' "${PROMOTE_OUTPUT}"
if ! grep -q "promoted ${NAME}" <<<"${PROMOTE_OUTPUT}"; then
  echo "template resolution smoke did not promote ${VERSION_ID} as stable" >&2
  exit 1
fi

create_and_capture() {
  local ref="$1"
  local label="$2"
  local output
  local attempt
  for attempt in 1 2 3; do
    set +e
    output="$(HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
      node "${CLI}" create --template "${ref}" --name "${label}" 2>&1)"
    local status=$?
    set -e
    if [[ "${status}" -eq 0 ]]; then
      break
    fi
    printf '%s\n' "${output}" >&2
    if [[ "${attempt}" -eq 3 ]]; then
      echo "create by ${ref} failed after ${attempt} attempts" >&2
      exit 1
    fi
    sleep 5
  done
  printf '%s\n' "${output}"
  local sandbox_id
  sandbox_id="$(printf '%s\n' "${output}" | awk '/^sbx_/ {print $1}' | tail -1)"
  if [[ -z "${sandbox_id}" ]]; then
    echo "create by ${ref} did not print a sandbox id" >&2
    exit 1
  fi
  SANDBOX_IDS+=("${sandbox_id}")
  set +e
  HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
    node "${CLI}" kill "${sandbox_id}"
  local kill_status=$?
  set -e
  if [[ "${kill_status}" -ne 0 ]]; then
    echo "warning: sandbox ${sandbox_id} was created but immediate cleanup failed; final cleanup will retry" >&2
  fi
}

create_and_capture "${NAME}" "by-name-${NAME}"
create_and_capture "${NAME}:stable" "by-stable-${NAME}"
create_and_capture "${VERSION_ID}" "by-version-${NAME}"

PGPOD="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri get pod -l app=harakiri-postgres -o jsonpath='{.items[0].metadata.name}')"
IDS_SQL="$(printf "'%s'," "${SANDBOX_IDS[@]}")"
IDS_SQL="(${IDS_SQL%,})"
RESOLUTION_STATE="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" -n harakiri exec "${PGPOD}" -- \
  psql -U harakiri -d harakiri -qAtc "select count(*) || '|' || count(distinct template_id) || '|' || count(distinct template_version_id) || '|' || count(template_image_digest) || '|' || min(template_id) || '|' || min(template_version_id) from sandboxes where id in ${IDS_SQL};")"
IFS='|' read -r SANDBOX_COUNT TEMPLATE_COUNT VERSION_COUNT DIGEST_COUNT STORED_TEMPLATE STORED_VERSION <<<"${RESOLUTION_STATE}"
if [[ "${SANDBOX_COUNT}" != "3" || "${TEMPLATE_COUNT}" != "1" || "${VERSION_COUNT}" != "1" || "${DIGEST_COUNT}" != "3" || "${STORED_TEMPLATE}" != "${NAME}" || "${STORED_VERSION}" != "${VERSION_ID}" ]]; then
  echo "template resolution metadata mismatch: ${RESOLUTION_STATE}" >&2
  exit 1
fi

echo "template resolution smoke passed: build=${BUILD_ID} version=${VERSION_ID} sandboxes=${SANDBOX_IDS[*]}"
