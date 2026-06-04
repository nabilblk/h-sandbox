#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ -z "${HARAKIRI_API_URL:-}" || -z "${HARAKIRI_API_KEY:-}" ]]; then
  echo "skipped: set HARAKIRI_API_URL and HARAKIRI_API_KEY to run SDK conformance"
  exit 0
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

pnpm --dir "${ROOT}" pack:sdk >/tmp/harakiri-sdk-conformance-pack.log
SDK_TARBALL="$(ls -t "${ROOT}"/dist-packages/h-sandbox-sdk-*.tgz | head -n1)"

cp "${ROOT}/tests/conformance/sdk-runtime.test.mjs" "${TMP_DIR}/sdk-runtime.test.mjs"
cat >"${TMP_DIR}/package.json" <<'JSON'
{
  "type": "module",
  "private": true
}
JSON

npm install --silent --prefix "${TMP_DIR}" "${SDK_TARBALL}" >/tmp/harakiri-sdk-conformance-install.log
node --test "${TMP_DIR}/sdk-runtime.test.mjs"
