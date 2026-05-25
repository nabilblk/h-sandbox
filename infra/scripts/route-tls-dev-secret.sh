#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export KUBECONFIG="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"

NAMESPACE="${HARAKIRI_ROUTE_TLS_NAMESPACE:-opensandbox-system}"
SECRET_NAME="${HARAKIRI_ROUTE_TLS_SECRET:-harakiri-sandbox-wildcard-tls}"
DOMAIN="${HARAKIRI_ROUTE_DOMAIN:-sandbox.localhost}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

cat >"${TMP_DIR}/openssl.cnf" <<EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = *.${DOMAIN}

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = *.${DOMAIN}
DNS.2 = ${DOMAIN}
EOF

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days "${HARAKIRI_ROUTE_TLS_DAYS:-30}" \
  -keyout "${TMP_DIR}/tls.key" \
  -out "${TMP_DIR}/tls.crt" \
  -config "${TMP_DIR}/openssl.cnf" >/dev/null 2>&1

kubectl -n "${NAMESPACE}" create secret tls "${SECRET_NAME}" \
  --cert="${TMP_DIR}/tls.crt" \
  --key="${TMP_DIR}/tls.key" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "dev TLS secret ${NAMESPACE}/${SECRET_NAME} is ready for *.${DOMAIN}"
