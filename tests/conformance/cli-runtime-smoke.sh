#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-}"
API_KEY="${HARAKIRI_API_KEY:-}"
TEMPLATE="${HARAKIRI_CONFORMANCE_TEMPLATE:-python-3.12-data}"
ROUTE_PORT="${HARAKIRI_CONFORMANCE_ROUTE_PORT:-5173}"

if [[ -z "${API_URL}" || -z "${API_KEY}" ]]; then
  echo "skipped: set HARAKIRI_API_URL and HARAKIRI_API_KEY to run CLI conformance"
  exit 0
fi

pnpm --dir "${ROOT}" --filter @harakiri/cli build >/tmp/harakiri-cli-conformance-build.log

TMP_HOME="$(mktemp -d)"
TMP_DIR="$(mktemp -d)"
export HOME="${TMP_HOME}"
CLI=(node "${ROOT}/packages/cli/dist/index.js")
SBX_ID=""
SERVER_COMMAND=""

cleanup() {
  set +e
  if [[ -n "${SBX_ID}" && -n "${SERVER_COMMAND}" ]]; then
    "${CLI[@]}" command kill "${SBX_ID}" "${SERVER_COMMAND}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${SBX_ID}" ]]; then
    "${CLI[@]}" kill "${SBX_ID}" >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_HOME}" "${TMP_DIR}"
}
trap cleanup EXIT

"${CLI[@]}" login --api-url "${API_URL}" --api-key "${API_KEY}" >/dev/null

CREATE_OUT="$("${CLI[@]}" create --template "${TEMPLATE}" --name "cli-conformance" --ttl 300)"
SBX_ID="$(grep -Eo 'sbx_[A-Za-z0-9_-]+' <<<"${CREATE_OUT}" | tail -n1)"
if [[ -z "${SBX_ID}" ]]; then
  echo "failed to create sandbox" >&2
  exit 1
fi
echo "created ${SBX_ID}"

RUN_OUT="$("${CLI[@]}" run "${SBX_ID}" --cmd "python - <<'PY'
print('cli-conformance-ok')
PY" --cwd /tmp --timeout-ms 30000)"
grep -q "cli-conformance-ok" <<<"${RUN_OUT}"

"${CLI[@]}" file-mkdir "${SBX_ID}" --path /tmp/harakiri-cli --recursive >/dev/null
"${CLI[@]}" file-write "${SBX_ID}" --path /tmp/harakiri-cli/input.txt --content "from cli" --parents >/dev/null
READ_OUT="$("${CLI[@]}" file-read "${SBX_ID}" --path /tmp/harakiri-cli/input.txt)"
grep -q "from cli" <<<"${READ_OUT}"
"${CLI[@]}" file-rename "${SBX_ID}" --from /tmp/harakiri-cli/input.txt --to /tmp/harakiri-cli/renamed.txt >/dev/null
printf "cli artifact\n" >"${TMP_DIR}/artifact.txt"
"${CLI[@]}" file-upload "${SBX_ID}" --path /tmp/harakiri-cli/artifact.txt --from "${TMP_DIR}/artifact.txt" --parents >/dev/null
"${CLI[@]}" file-download "${SBX_ID}" --path /tmp/harakiri-cli/artifact.txt --to "${TMP_DIR}/downloaded.txt" >/dev/null
cmp "${TMP_DIR}/artifact.txt" "${TMP_DIR}/downloaded.txt"
"${CLI[@]}" files "${SBX_ID}" --path /tmp/harakiri-cli | grep -q "renamed.txt"

SERVER_COMMAND="$("${CLI[@]}" command run "${SBX_ID}" --cmd "python -m http.server ${ROUTE_PORT} --bind 0.0.0.0" --cwd /tmp/harakiri-cli --detached | awk '{print $1}')"
if [[ -z "${SERVER_COMMAND}" ]]; then
  echo "failed to start detached command" >&2
  exit 1
fi
"${CLI[@]}" command status "${SBX_ID}" "${SERVER_COMMAND}" | grep -Eq "running|succeeded"
"${CLI[@]}" command logs "${SBX_ID}" "${SERVER_COMMAND}" >/dev/null || true

ROUTE_OUT="$("${CLI[@]}" expose "${SBX_ID}" --port "${ROUTE_PORT}" --access token)"
grep -q "/v1/route-proxy/" <<<"${ROUTE_OUT}"
"${CLI[@]}" routes "${SBX_ID}" | grep -q "${ROUTE_PORT}"
"${CLI[@]}" unexpose "${SBX_ID}" --port "${ROUTE_PORT}" >/dev/null

"${CLI[@]}" metrics "${SBX_ID}" | grep -q "^cpu"
"${CLI[@]}" logs "${SBX_ID}" >/dev/null
"${CLI[@]}" egress set "${SBX_ID}" --mode restricted --preset python-package-install --allow api.github.com >/dev/null
"${CLI[@]}" egress test "${SBX_ID}" https://api.github.com >/dev/null || true
"${CLI[@]}" renew "${SBX_ID}" >/dev/null
"${CLI[@]}" file-rm "${SBX_ID}" --path /tmp/harakiri-cli --recursive >/dev/null
"${CLI[@]}" kill "${SBX_ID}" >/dev/null
SBX_ID=""

echo "cli conformance passed"
