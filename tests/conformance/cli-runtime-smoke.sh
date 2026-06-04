#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${HARAKIRI_API_URL:-}"
API_KEY="${HARAKIRI_API_KEY:-}"
TEMPLATE="${HARAKIRI_CONFORMANCE_TEMPLATE:-python-3.12-data}"
ROUTE_PORT="${HARAKIRI_CONFORMANCE_ROUTE_PORT:-5173}"
ROUTE_FETCH_BASE_URL="${HARAKIRI_CONFORMANCE_ROUTE_BASE_URL:-}"

if [[ -z "${API_URL}" || -z "${API_KEY}" ]]; then
  echo "skipped: set HARAKIRI_API_URL and HARAKIRI_API_KEY to run CLI conformance"
  exit 0
fi

pnpm --dir "${ROOT}" pack:sdk >/tmp/harakiri-cli-conformance-sdk-pack.log
pnpm --dir "${ROOT}" pack:cli >/tmp/harakiri-cli-conformance-pack.log
SDK_TARBALL="$(ls -t "${ROOT}"/dist-packages/h-sandbox-sdk-*.tgz | head -n1)"
CLI_TARBALL="$(ls -t "${ROOT}"/dist-packages/h-sandbox-cli-*.tgz | head -n1)"

TMP_HOME="$(mktemp -d)"
TMP_DIR="$(mktemp -d)"
TMP_PREFIX="$(mktemp -d)"
export HOME="${TMP_HOME}"
npm install --global --silent --prefix "${TMP_PREFIX}" "${SDK_TARBALL}" "${CLI_TARBALL}" >/tmp/harakiri-cli-conformance-install.log
CLI=("${TMP_PREFIX}/bin/harakiri")
SBX_ID=""
SERVER_COMMAND=""

route_fetch_url() {
  node -e 'const original = new URL(process.argv[1]); if (process.argv[2]) { const base = new URL(process.argv[2]); original.protocol = base.protocol; original.host = base.host; } console.log(original.toString());' "$1" "${ROUTE_FETCH_BASE_URL}"
}

curl_with_retry() {
  local url="$1"
  local header_name="${2:-}"
  local header_value="${3:-}"
  local output="${4:-}"
  local attempt
  for attempt in {1..12}; do
    if [[ -n "${header_name}" ]]; then
      if curl -fsS -H "${header_name}: ${header_value}" "${url}" -o "${output:-/dev/stdout}"; then
        return 0
      fi
    elif curl -fsS "${url}" -o "${output:-/dev/stdout}"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

cleanup() {
  set +e
  if [[ -n "${SBX_ID}" && -n "${SERVER_COMMAND}" ]]; then
    "${CLI[@]}" command kill "${SBX_ID}" "${SERVER_COMMAND}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${SBX_ID}" ]]; then
    "${CLI[@]}" kill "${SBX_ID}" >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_HOME}" "${TMP_DIR}" "${TMP_PREFIX}"
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
DOWNLOAD_JSON="$("${CLI[@]}" file-download "${SBX_ID}" --path /tmp/harakiri-cli/artifact.txt --to "${TMP_DIR}/downloaded.txt" --json)"
node -e 'const result = JSON.parse(process.argv[1]); if (result.transfer?.mode !== "json-base64" || result.localPath !== process.argv[2]) process.exit(1);' "${DOWNLOAD_JSON}" "${TMP_DIR}/downloaded.txt"
cmp "${TMP_DIR}/artifact.txt" "${TMP_DIR}/downloaded.txt"
"${CLI[@]}" files "${SBX_ID}" --path /tmp/harakiri-cli | grep -q "renamed.txt"

SERVER_COMMAND="$("${CLI[@]}" command run "${SBX_ID}" --cmd "python -m http.server ${ROUTE_PORT} --bind 0.0.0.0" --cwd /tmp/harakiri-cli --detached | awk '{print $1}')"
if [[ -z "${SERVER_COMMAND}" ]]; then
  echo "failed to start detached command" >&2
  exit 1
fi
"${CLI[@]}" command wait "${SBX_ID}" "${SERVER_COMMAND}" --status running --timeout-ms 30000 >/dev/null
"${CLI[@]}" command logs "${SBX_ID}" "${SERVER_COMMAND}" >/dev/null || true

EXPOSE_ARGS=(expose "${SBX_ID}" --port "${ROUTE_PORT}" --access token --json)
if [[ -z "${ROUTE_FETCH_BASE_URL}" ]]; then
  EXPOSE_ARGS+=(--wait --wait-path /)
fi
ROUTE_OUT="$("${CLI[@]}" "${EXPOSE_ARGS[@]}")"
node -e 'const result = JSON.parse(process.argv[1]); if (result.route.port !== Number(process.argv[2]) || result.route.accessMode !== "token" || !result.accessToken || !result.accessHeaderName) process.exit(1);' "${ROUTE_OUT}" "${ROUTE_PORT}"
"${CLI[@]}" routes "${SBX_ID}" --json | node -e 'let input = ""; process.stdin.on("data", (chunk) => input += chunk); process.stdin.on("end", () => { const result = JSON.parse(input); if (!result.routes.some((route) => route.port === Number(process.argv[1]))) process.exit(1); });' "${ROUTE_PORT}"
if [[ "${HARAKIRI_CONFORMANCE_ROUTE_FETCH:-}" == "1" ]]; then
  ROUTE_URL="$(node -e 'console.log(JSON.parse(process.argv[1]).route.url)' "${ROUTE_OUT}")"
  ROUTE_HEADER="$(node -e 'console.log(JSON.parse(process.argv[1]).accessHeaderName)' "${ROUTE_OUT}")"
  ROUTE_TOKEN="$(node -e 'console.log(JSON.parse(process.argv[1]).accessToken)' "${ROUTE_OUT}")"
  ROUTE_FETCH_URL="$(route_fetch_url "${ROUTE_URL}")"
  ROUTE_BODY="${TMP_DIR}/route-body.html"
  curl_with_retry "${ROUTE_FETCH_URL}" "${ROUTE_HEADER}" "${ROUTE_TOKEN}" "${ROUTE_BODY}"
  grep -Eq "renamed.txt|artifact" "${ROUTE_BODY}"
fi
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
