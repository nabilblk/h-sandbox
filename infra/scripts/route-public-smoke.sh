#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
ROUTE_PORT="${HARAKIRI_ROUTE_PORT:-3000}"
RESOLVER="${HARAKIRI_ROUTE_DNS_RESOLVER:-1.1.1.1}"

SBX_ID=""
TEMP_KEY=0
if [[ -z "${HARAKIRI_API_KEY:-}" ]]; then
  eval "$("${ROOT}/infra/scripts/create-test-api-key.sh")"
  TEMP_KEY=1
fi
KEY="${HARAKIRI_API_KEY}"

cleanup() {
  if [[ -n "${SBX_ID}" ]]; then
    curl -fsS -X DELETE -H "x-api-key: ${KEY}" "${API_URL}/v1/sandboxes/${SBX_ID}" >/dev/null 2>&1 || true
  fi
  if [[ "${TEMP_KEY}" == "1" && -n "${HARAKIRI_API_KEY_ID:-}" && -n "${HARAKIRI_ACCESS_TOKEN:-}" ]]; then
    curl -fsS -X DELETE -H "authorization: Bearer ${HARAKIRI_ACCESS_TOKEN}" "${API_URL}/v1/api-keys/${HARAKIRI_API_KEY_ID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

resolve_edge_ip() {
  local host="$1"
  local records
  if [[ -n "${RESOLVER}" ]]; then
    records="$(dig @"${RESOLVER}" +short "${host}" A)"
  else
    records="$(dig +short "${host}" A)"
  fi
  printf '%s\n' "${records}" | awk '/^[0-9.]+$/ { print; exit }'
}

CREATE_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d '{"template":"python-3.12","name":"route-public-smoke","ttlSeconds":90}' \
  "${API_URL}/v1/sandboxes")"
SBX_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.sandbox.id)" "${CREATE_RESPONSE}")"
echo "created ${SBX_ID}"

curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"command\":\"python -m http.server ${ROUTE_PORT} --bind 0.0.0.0 >/tmp/harakiri-public-http.log 2>&1 &\"}" \
  "${API_URL}/v1/sandboxes/${SBX_ID}/run" >/dev/null

ROUTE_JSON="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"port\":${ROUTE_PORT},\"protocol\":\"http\"}" \
  "${API_URL}/v1/sandboxes/${SBX_ID}/routes")"
URL="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.route.url)" "${ROUTE_JSON}")"
HOST="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.route.host)" "${ROUTE_JSON}")"
STATE="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.route.state)" "${ROUTE_JSON}")"
PROVIDER="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.route.provider)" "${ROUTE_JSON}")"
echo "route ${URL} state=${STATE} provider=${PROVIDER}"

EDGE_IP="$(resolve_edge_ip "${HOST}")"
if [[ -z "${EDGE_IP}" ]]; then
  echo "no public DNS A record found for ${HOST}" >&2
  exit 1
fi
echo "resolved ${HOST} -> ${EDGE_IP}"

for _ in $(seq 1 12); do
  if curl -fsS --max-time 20 --resolve "${HOST}:443:${EDGE_IP}" "${URL}/" \
    >/tmp/harakiri-route-public-index.html 2>/tmp/harakiri-route-public-curl.err; then
    sed -n '1,4p' /tmp/harakiri-route-public-index.html
    cleanup
    trap - EXIT
    echo "route public HTTPS smoke passed"
    exit 0
  fi
  sleep 2
done

echo "route public HTTPS smoke failed for ${URL}" >&2
cat /tmp/harakiri-route-public-curl.err >&2 || true
if grep -qi "handshake failure" /tmp/harakiri-route-public-curl.err; then
  cat >&2 <<EOF
TLS handshake failed before reaching k0s. For proxied Cloudflare DNS or
Cloudflare Tunnel, configure a Cloudflare edge certificate for *.${HOST#*.}
in addition to the Kubernetes origin certificate.
EOF
fi
exit 1
