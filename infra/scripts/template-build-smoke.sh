#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
CLI="${HARAKIRI_CLI:-${ROOT}/packages/cli/dist/index.js}"
NAME="${HARAKIRI_TEMPLATE_SMOKE_NAME:-kaniko-smoke-$(date +%s)}"
BUILD_TIMEOUT_SECONDS="${HARAKIRI_TEMPLATE_BUILD_TIMEOUT_SECONDS:-300}"
SANDBOX_ID=""
HARAKIRI_API_KEY_ID="${HARAKIRI_API_KEY_ID:-}"

cleanup() {
  if [[ -n "${SANDBOX_ID}" ]]; then
    HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
      node "${CLI}" kill "${SANDBOX_ID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${HARAKIRI_API_KEY_ID}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${HARAKIRI_API_KEY}" \
      "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
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
  node "${CLI}" template build "${CONTEXT_DIR}" --name "${NAME}" --dockerfile Dockerfile)"
printf '%s\n' "${BUILD_OUTPUT}"
BUILD_ID="$(printf '%s\n' "${BUILD_OUTPUT}" | awk '/^bld_/ {print $1}' | tail -1)"
if [[ -z "${BUILD_ID}" ]]; then
  echo "template build did not print a build id" >&2
  exit 1
fi

deadline=$((SECONDS + BUILD_TIMEOUT_SECONDS))
while (( SECONDS < deadline )); do
  BUILD_STATUS="$(curl -fsS -H "x-api-key: ${HARAKIRI_API_KEY}" "${API_URL}/v1/template-builds/${BUILD_ID}" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const b=JSON.parse(s).build; console.log([b.status,b.imageDigest||"",b.imageDestination||""].join("\t"));})')"
  printf '%s\n' "${BUILD_STATUS}"
  case "${BUILD_STATUS}" in
    success*) break ;;
    failed*|canceled*) exit 1 ;;
  esac
  sleep 2
done

if [[ "${BUILD_STATUS}" != success* ]]; then
  echo "template build ${BUILD_ID} did not finish within ${BUILD_TIMEOUT_SECONDS}s" >&2
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

echo "template build smoke passed: ${BUILD_ID} ${SANDBOX_ID}"
