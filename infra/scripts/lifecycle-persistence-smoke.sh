#!/usr/bin/env bash
set -euo pipefail

API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="${HARAKIRI_LIFECYCLE_PERSISTENCE_TEMPLATE:-python-3.12}"
SNAPSHOT_TIMEOUT_MS="${HARAKIRI_LIFECYCLE_PERSISTENCE_SNAPSHOT_TIMEOUT_MS:-120000}"
RESTORE_TIMEOUT_MS="${HARAKIRI_LIFECYCLE_PERSISTENCE_RESTORE_TIMEOUT_MS:-30000}"

SOURCE_SANDBOX_ID=""
RESTORED_SANDBOX_ID=""
SNAPSHOT_ID=""
TEMP_KEY=0

cleanup() {
  set +e
  if [[ -n "${RESTORED_SANDBOX_ID}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${RESTORED_SANDBOX_ID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${SOURCE_SANDBOX_ID}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SOURCE_SANDBOX_ID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${SNAPSHOT_ID}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/snapshots/${SNAPSHOT_ID}" >/dev/null 2>&1 || true
  fi
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi
KEY="${HARAKIRI_API_KEY}"

json_field() {
  node -e "const r=JSON.parse(process.argv[1]); const path=process.argv[2].split('.'); let v=r; for (const k of path) v=v?.[k]; console.log(v ?? '')" "$1" "$2"
}

assert_run_stdout_contains() {
  local sandbox_id="$1"
  local expected="$2"
  local response
  response="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
    -d '{"command":"cat /workspace/harakiri-lifecycle-persistence-marker.txt"}' \
    "${API_URL}/v1/sandboxes/${sandbox_id}/run")"
  node -e "const r=JSON.parse(process.argv[1]); if (r.result.exitCode !== 0 || !String(r.result.stdout || '').includes(process.argv[2])) process.exit(1)" \
    "${response}" "${expected}"
}

CREATE_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"template\":\"${TEMPLATE}\",\"name\":\"lifecycle-persistence-smoke\",\"ttlSeconds\":300,\"wait\":true,\"waitTimeoutMs\":30000}" \
  "${API_URL}/v1/sandboxes")"
SOURCE_SANDBOX_ID="$(json_field "${CREATE_RESPONSE}" "sandbox.id")"
echo "created source ${SOURCE_SANDBOX_ID}"

curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d '{"command":"mkdir -p /workspace && printf lifecycle-persistence-live > /workspace/harakiri-lifecycle-persistence-marker.txt"}' \
  "${API_URL}/v1/sandboxes/${SOURCE_SANDBOX_ID}/run" >/dev/null
echo "wrote marker"

PAUSE_RESPONSE="$(curl -fsS -X POST -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SOURCE_SANDBOX_ID}/pause")"
PAUSE_STATUS="$(json_field "${PAUSE_RESPONSE}" "sandbox.status")"
if [[ "${PAUSE_STATUS}" != "paused" ]]; then
  echo "pause failed: expected paused, got ${PAUSE_STATUS}" >&2
  exit 1
fi
echo "paused source"

RESUME_RESPONSE="$(curl -fsS -X POST -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SOURCE_SANDBOX_ID}/resume")"
RESUME_STATUS="$(json_field "${RESUME_RESPONSE}" "sandbox.status")"
if [[ "${RESUME_STATUS}" != "running" && "${RESUME_STATUS}" != "idle" ]]; then
  echo "resume failed: expected running or idle, got ${RESUME_STATUS}" >&2
  exit 1
fi
echo "resumed source"
assert_run_stdout_contains "${SOURCE_SANDBOX_ID}" "lifecycle-persistence-live"
echo "verified source marker after resume"

SNAPSHOT_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"name\":\"lifecycle-persistence-smoke\",\"wait\":true,\"waitTimeoutMs\":${SNAPSHOT_TIMEOUT_MS}}" \
  "${API_URL}/v1/sandboxes/${SOURCE_SANDBOX_ID}/snapshots")"
SNAPSHOT_ID="$(json_field "${SNAPSHOT_RESPONSE}" "snapshot.id")"
SNAPSHOT_STATUS="$(json_field "${SNAPSHOT_RESPONSE}" "snapshot.status")"
if [[ "${SNAPSHOT_STATUS}" != "ready" ]]; then
  echo "snapshot failed: expected ready, got ${SNAPSHOT_STATUS}" >&2
  exit 1
fi
echo "snapshot ready ${SNAPSHOT_ID}"

RESTORE_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"snapshotId\":\"${SNAPSHOT_ID}\",\"name\":\"lifecycle-persistence-restore-smoke\",\"ttlSeconds\":300,\"wait\":true,\"waitTimeoutMs\":${RESTORE_TIMEOUT_MS}}" \
  "${API_URL}/v1/sandboxes")"
RESTORED_SANDBOX_ID="$(json_field "${RESTORE_RESPONSE}" "sandbox.id")"
echo "created restored ${RESTORED_SANDBOX_ID}"
assert_run_stdout_contains "${RESTORED_SANDBOX_ID}" "lifecycle-persistence-live"
echo "verified restored marker"

curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/snapshots/${SNAPSHOT_ID}" >/dev/null
echo "deleted snapshot ${SNAPSHOT_ID}"
SNAPSHOT_ID=""

curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${RESTORED_SANDBOX_ID}" >/dev/null
echo "killed restored ${RESTORED_SANDBOX_ID}"
RESTORED_SANDBOX_ID=""

curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SOURCE_SANDBOX_ID}" >/dev/null
echo "killed source ${SOURCE_SANDBOX_ID}"
SOURCE_SANDBOX_ID=""

echo "lifecycle persistence smoke passed"
