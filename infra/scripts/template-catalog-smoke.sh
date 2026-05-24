#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
CLI="${HARAKIRI_CLI:-${ROOT}/packages/cli/dist/index.js}"
CLI_HOME="$(mktemp -d /tmp/harakiri-cli-catalog-smoke.XXXXXX)"
TEMP_KEY=0
SANDBOX_IDS=()

cleanup() {
  set +u
  if [[ -n "${HARAKIRI_API_KEY:-}" ]]; then
    for sandbox_id in "${SANDBOX_IDS[@]}"; do
      HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
        node "${CLI}" kill "${sandbox_id}" >/dev/null 2>&1 || true
    done
  fi
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" \
      "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
  rm -rf "${CLI_HOME}"
}
trap cleanup EXIT

if [[ ! -x "${CLI}" ]]; then
  pnpm --dir "${ROOT}" --filter @harakiri/cli build
fi

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi

cases=(
  "python-3.12|python --version|Python"
  "python-3.12-data|python --version|Python"
  "node-20|node --version|v"
)

for spec in "${cases[@]}"; do
  IFS='|' read -r template command expected <<<"${spec}"
  name="catalog-${template//./-}"
  create_output="$(HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
    node "${CLI}" create --template "${template}" --name "${name}" --ttl 120)"
  printf '%s\n' "${create_output}"
  sandbox_id="$(printf '%s\n' "${create_output}" | awk '/^sbx_/ {print $1}' | tail -1)"
  if [[ -z "${sandbox_id}" ]]; then
    echo "template ${template} did not create a sandbox" >&2
    exit 1
  fi
  SANDBOX_IDS+=("${sandbox_id}")

  run_output="$(HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
    node "${CLI}" run "${sandbox_id}" --cmd "${command}")"
  printf '%s\n' "${run_output}"
  if ! grep -q "${expected}" <<<"${run_output}"; then
    echo "template ${template} command did not print expected marker ${expected}" >&2
    exit 1
  fi

  HOME="${CLI_HOME}" HARAKIRI_API_URL="${API_URL}" HARAKIRI_API_KEY="${HARAKIRI_API_KEY}" \
    node "${CLI}" kill "${sandbox_id}"
  current_ids=("${SANDBOX_IDS[@]}")
  SANDBOX_IDS=()
  for existing_id in "${current_ids[@]}"; do
    if [[ "${existing_id}" != "${sandbox_id}" ]]; then
      SANDBOX_IDS+=("${existing_id}")
    fi
  done
done

echo "template catalog smoke passed: python-3.12 python-3.12-data node-20"
