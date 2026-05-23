#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export KUBECONFIG="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"

API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
INGRESS_HTTPS_PORT="${HARAKIRI_INGRESS_HTTPS_PORT:-18087}"
ROUTE_PORT="${HARAKIRI_ROUTE_PORT:-3000}"
TLS_SECRET="${HARAKIRI_ROUTE_TLS_SECRET:-harakiri-sandbox-wildcard-tls}"

if ! kubectl -n opensandbox-system get secret "${TLS_SECRET}" >/dev/null 2>&1; then
  "${ROOT}/infra/scripts/route-tls-dev-secret.sh"
fi

PF_PID=""
if ! lsof -tiTCP:"${INGRESS_HTTPS_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  nohup kubectl -n ingress-nginx port-forward svc/ingress-nginx-controller "${INGRESS_HTTPS_PORT}:443" \
    >/tmp/harakiri-ingress-https-forward.log 2>&1 &
  PF_PID="$!"
  for _ in $(seq 1 30); do
    if lsof -tiTCP:"${INGRESS_HTTPS_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi

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
  if [[ -n "${PF_PID}" ]]; then
    kill "${PF_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

CREATE_RESPONSE="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d '{"template":"python-3.12","name":"route-ingress-smoke","ttlSeconds":90}' \
  "${API_URL}/v1/sandboxes")"
SBX_ID="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.sandbox.id)" "${CREATE_RESPONSE}")"
echo "created ${SBX_ID}"

curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"command\":\"python -m http.server ${ROUTE_PORT} --bind 0.0.0.0 >/tmp/harakiri-ingress-http.log 2>&1 &\"}" \
  "${API_URL}/v1/sandboxes/${SBX_ID}/run" >/dev/null

ROUTE_JSON="$(curl -fsS -H "x-api-key: ${KEY}" -H 'content-type: application/json' \
  -d "{\"port\":${ROUTE_PORT},\"protocol\":\"http\"}" \
  "${API_URL}/v1/sandboxes/${SBX_ID}/routes")"
URL="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.route.url)" "${ROUTE_JSON}")"
HOST="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.route.host)" "${ROUTE_JSON}")"
echo "route ${URL}"

for _ in $(seq 1 12); do
  if curl -kfsS --connect-to "${HOST}:443:127.0.0.1:${INGRESS_HTTPS_PORT}" "https://${HOST}/" \
    >/tmp/harakiri-route-ingress-index.html 2>/tmp/harakiri-route-ingress-curl.err; then
    sed -n '1,4p' /tmp/harakiri-route-ingress-index.html
    echo "route ingress HTTPS smoke passed"
    exit 0
  fi
  sleep 2
done

echo "route ingress HTTPS smoke failed for ${URL}" >&2
cat /tmp/harakiri-route-ingress-curl.err >&2 || true
exit 1
