#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export KUBECONFIG="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN with Zone:DNS:Edit and Zone:Zone:Read for harakiri.io}"

DOMAIN="${HARAKIRI_ROUTE_DOMAIN:-harakiri.io}"
DNS_ZONE="${HARAKIRI_ROUTE_DNS_ZONE:-harakiri.io}"
EMAIL="${LETSENCRYPT_EMAIL:-nabilblk@gmail.com}"
SECRET_NAME="${HARAKIRI_ROUTE_TLS_SECRET:-harakiri-sandbox-wildcard-tls}"
ISSUER_NAME="${HARAKIRI_LETSENCRYPT_ISSUER:-letsencrypt-cloudflare}"
CERT_MANAGER_NAMESPACE="${CERT_MANAGER_NAMESPACE:-cert-manager}"
ACME_SERVER="${LETSENCRYPT_ACME_SERVER:-https://acme-v02.api.letsencrypt.org/directory}"
TOKEN_SECRET_NAME="${HARAKIRI_CLOUDFLARE_TOKEN_SECRET:-cloudflare-api-token-secret}"

"${ROOT}/infra/scripts/cert-manager-install.sh"

kubectl create namespace "${CERT_MANAGER_NAMESPACE}" >/dev/null 2>&1 || true
kubectl -n "${CERT_MANAGER_NAMESPACE}" create secret generic "${TOKEN_SECRET_NAME}" \
  --from-literal=api-token="${CLOUDFLARE_API_TOKEN}" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: ${ISSUER_NAME}
spec:
  acme:
    email: ${EMAIL}
    server: ${ACME_SERVER}
    privateKeySecretRef:
      name: ${ISSUER_NAME}-account-key
    solvers:
      - selector:
          dnsZones:
            - ${DNS_ZONE}
        dns01:
          cloudflare:
            apiTokenSecretRef:
              name: ${TOKEN_SECRET_NAME}
              key: api-token
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${SECRET_NAME}
  namespace: opensandbox-system
spec:
  secretName: ${SECRET_NAME}
  issuerRef:
    name: ${ISSUER_NAME}
    kind: ClusterIssuer
  dnsNames:
    - "*.${DOMAIN}"
EOF

echo "requested Let's Encrypt wildcard origin certificate *.${DOMAIN}"
echo "watch with: kubectl -n opensandbox-system describe certificate ${SECRET_NAME}"
