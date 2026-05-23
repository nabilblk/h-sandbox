#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${HARAKIRI_ROUTE_DOMAIN:-harakiri.io}"
HOST="${HARAKIRI_ROUTE_TEST_HOST:-preflight-3000.${DOMAIN}}"
RESOLVER="${HARAKIRI_ROUTE_DNS_RESOLVER:-1.1.1.1}"

dig_records() {
  local host="$1"
  if [[ -n "${RESOLVER}" ]]; then
    dig @"${RESOLVER}" +short "${host}" A "${host}" CNAME
  else
    dig +short "${host}" A "${host}" CNAME
  fi
}

echo "checking DNS for ${DOMAIN}"
dig_records "${DOMAIN}" || true

echo "checking DNS for ${HOST}"
HOST_RECORDS="$(dig_records "${HOST}" || true)"
echo "${HOST_RECORDS}"
if [[ -z "${HOST_RECORDS}" ]]; then
  echo "no DNS records found for ${HOST}" >&2
  exit 1
fi

echo "checking TLS for ${HOST}"
IP="$(printf '%s\n' "${HOST_RECORDS}" | awk '/^[0-9.]+$/ { print; exit }')"
CURL_ARGS=(curl -sSI --max-time 10)
if [[ -n "${IP}" ]]; then
  CURL_ARGS+=(--resolve "${HOST}:443:${IP}")
fi
if ! "${CURL_ARGS[@]}" "https://${HOST}/" >/tmp/harakiri-route-preflight.headers 2>/tmp/harakiri-route-preflight.err; then
  cat /tmp/harakiri-route-preflight.err >&2 || true
  if grep -qi "handshake failure" /tmp/harakiri-route-preflight.err; then
    cat >&2 <<EOF
TLS handshake failed before reaching k0s. If this hostname is orange-clouded
or routed through Cloudflare Tunnel, Cloudflare must have an edge certificate
covering *.${DOMAIN}; a Kubernetes origin certificate alone is not enough.
EOF
  fi
  exit 1
fi
sed -n '1,3p' /tmp/harakiri-route-preflight.headers
echo "route preflight passed"
