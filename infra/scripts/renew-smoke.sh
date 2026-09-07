#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP_KEY=0
cleanup() {
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl --max-time 15 -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" \
      "${HARAKIRI_API_URL:-http://127.0.0.1:18082}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null || true
  fi
}
trap cleanup EXIT
if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi
export HARAKIRI_API_KEY
pnpm --dir "${ROOT}" --filter @h-sandbox/sdk build
node "${ROOT}/infra/scripts/renew-smoke.mjs"
