#!/usr/bin/env bash
set -euo pipefail

API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

SBX_ID=""
TEMP_KEY=0

cleanup() {
  set +e
  if [[ -n "${SBX_ID}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}" >/dev/null 2>&1 || true
  fi
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

urlencode() {
  node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$1"
}

if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi
KEY="${HARAKIRI_API_KEY}"

CREATE_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d '{"template":"python-3.12","name":"filesystem-smoke","ttlSeconds":180,"wait":true,"waitTimeoutMs":30000}' \
  "${API_URL}/v1/sandboxes")"
SBX_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.sandbox.id)" "${CREATE_RESPONSE}")"
echo "created ${SBX_ID}"

BASE="/tmp/harakiri-files"
TEXT_PATH="${BASE}/nested/task.txt"
BLOB_PATH="${BASE}/blob.bin"
RENAMED_PATH="${BASE}/nested/done.txt"
TEXT_ENCODED="$(urlencode "${TEXT_PATH}")"
BLOB_ENCODED="$(urlencode "${BLOB_PATH}")"
RENAMED_ENCODED="$(urlencode "${RENAMED_PATH}")"

curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"path\":\"${TEXT_PATH}\",\"content\":\"ready\\n\",\"createParents\":true}" \
  -X PUT "${API_URL}/v1/sandboxes/${SBX_ID}/files" >/dev/null
echo "wrote text"

READ_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}/files/read?path=${TEXT_ENCODED}")"
node -e "const r=JSON.parse(process.argv[1]); if (r.content !== 'ready\n') process.exit(1)" "${READ_RESPONSE}"
echo "read text"

LIST_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}/files?path=$(urlencode "${BASE}")")"
node -e "const r=JSON.parse(process.argv[1]); if (!Array.isArray(r.files) || !r.files.some((f) => f.path === process.argv[2])) process.exit(1); if (!r.source) process.exit(1)" "${LIST_RESPONSE}" "${BASE}/nested"
echo "listed directory"

curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"fromPath\":\"${TEXT_PATH}\",\"toPath\":\"${RENAMED_PATH}\"}" \
  "${API_URL}/v1/sandboxes/${SBX_ID}/files/rename" >/dev/null
STAT_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}/files/stat?path=${RENAMED_ENCODED}")"
node -e "const r=JSON.parse(process.argv[1]); if (r.file.path !== process.argv[2] || r.file.size < 1) process.exit(1)" "${STAT_RESPONSE}" "${RENAMED_PATH}"
echo "renamed text"

BLOB_B64="$(node -e "process.stdout.write(Buffer.from([0,255,1,2,72,75]).toString('base64'))")"
BLOB_SHA="$(node -e "const { createHash } = require('node:crypto'); const b=Buffer.from([0,255,1,2,72,75]); process.stdout.write('sha256:'+createHash('sha256').update(b).digest('hex'))")"
UPLOAD_BODY="$(node -e "console.log(JSON.stringify({ path: process.argv[1], contentBase64: process.argv[2], sizeBytes: 6, sha256: process.argv[3], createParents: true }))" "${BLOB_PATH}" "${BLOB_B64}" "${BLOB_SHA}")"
UPLOAD_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "${UPLOAD_BODY}" "${API_URL}/v1/sandboxes/${SBX_ID}/files/upload")"
node -e "const r=JSON.parse(process.argv[1]); if (r.sha256 !== process.argv[2] || r.transfer?.mode !== 'json-base64' || r.transfer?.encoding !== 'base64' || r.transfer?.maxBytes < 6) process.exit(1)" "${UPLOAD_RESPONSE}" "${BLOB_SHA}"
echo "uploaded artifact"

DOWNLOAD_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}/files/download?path=${BLOB_ENCODED}")"
node -e "const r=JSON.parse(process.argv[1]); if (r.contentBase64 !== process.argv[2] || r.sha256 !== process.argv[3] || r.sizeBytes !== 6 || r.transfer?.mode !== 'json-base64') process.exit(1)" "${DOWNLOAD_RESPONSE}" "${BLOB_B64}" "${BLOB_SHA}"
echo "downloaded artifact"

BAD_STATUS="$(curl -sS -o /tmp/harakiri-filesystem-bad-upload.json -w '%{http_code}' \
  -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"path\":\"${BASE}/bad.bin\",\"contentBase64\":\"${BLOB_B64}\",\"sha256\":\"sha256:0000000000000000000000000000000000000000000000000000000000000000\"}" \
  "${API_URL}/v1/sandboxes/${SBX_ID}/files/upload")"
if [[ "${BAD_STATUS}" != "400" ]]; then
  echo "filesystem smoke failed: checksum mismatch returned ${BAD_STATUS}" >&2
  cat /tmp/harakiri-filesystem-bad-upload.json >&2 || true
  exit 1
fi
echo "rejected bad checksum"

curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}/files?path=${BLOB_ENCODED}" >/dev/null
curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}/files?path=${RENAMED_ENCODED}" >/dev/null
echo "removed files"

curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}" >/dev/null
echo "killed ${SBX_ID}"
SBX_ID=""

echo "filesystem smoke passed"
