#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ZONE_ID:?set CLOUDFLARE_ZONE_ID}"
: "${HARAKIRI_SANDBOX_DNS_TARGET:?set HARAKIRI_SANDBOX_DNS_TARGET to the ingress hostname or tunnel hostname}"

RECORD_NAME="${HARAKIRI_SANDBOX_DNS_NAME:-*.harakiri.io}"
RECORD_TYPE="${HARAKIRI_SANDBOX_DNS_TYPE:-CNAME}"
PROXIED="${HARAKIRI_SANDBOX_DNS_PROXIED:-true}"

api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  if [[ -n "${body}" ]]; then
    curl -fsS -X "${method}" "https://api.cloudflare.com/client/v4${path}" \
      -H "authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "content-type: application/json" \
      --data "${body}"
  else
    curl -fsS -X "${method}" "https://api.cloudflare.com/client/v4${path}" \
      -H "authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "content-type: application/json"
  fi
}

ENCODED_RECORD_NAME="$(node -e "console.log(encodeURIComponent(process.argv[1]))" "${RECORD_NAME}")"
record_id="$(api GET "/zones/${CLOUDFLARE_ZONE_ID}/dns_records?type=${RECORD_TYPE}&name=${ENCODED_RECORD_NAME}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d); if(!r.success) throw new Error(JSON.stringify(r.errors)); console.log(r.result[0]?.id ?? '')})")"

body="$(node -e "console.log(JSON.stringify({type:process.argv[1],name:process.argv[2],content:process.argv[3],ttl:1,proxied:process.argv[4]==='true'}))" \
  "${RECORD_TYPE}" "${RECORD_NAME}" "${HARAKIRI_SANDBOX_DNS_TARGET}" "${PROXIED}")"

if [[ -n "${record_id}" ]]; then
  api PUT "/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${record_id}" "${body}" >/dev/null
  echo "updated ${RECORD_TYPE} ${RECORD_NAME} -> ${HARAKIRI_SANDBOX_DNS_TARGET}"
else
  api POST "/zones/${CLOUDFLARE_ZONE_ID}/dns_records" "${body}" >/dev/null
  echo "created ${RECORD_TYPE} ${RECORD_NAME} -> ${HARAKIRI_SANDBOX_DNS_TARGET}"
fi
