#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

: "${HARAKIRI_PUBLIC_API_URL:=https://sb-api.harakiri.io}"
: "${HARAKIRI_PUBLIC_KEYCLOAK_URL:=https://sb-auth.harakiri.io}"
: "${HARAKIRI_SANDBOX_ROUTE_DOMAIN:=harakiri.io}"
: "${HARAKIRI_SANDBOX_ROUTE_SCHEME:=https}"
: "${HARAKIRI_KEYCLOAK_ISSUER_ALLOWLIST:=http://keycloak.keycloak.svc.cluster.local:8080/realms/harakiri,http://127.0.0.1:18084/realms/harakiri,https://sb-auth.harakiri.io/realms/harakiri}"

# The maintainer k0s lab already has these components installed. Override to 1
# when bootstrapping a fresh cluster from this wrapper.
: "${HARAKIRI_BUILD_OPEN_SANDBOX_INGRESS:=0}"
: "${HARAKIRI_INSTALL_INGRESS_NGINX:=0}"

export HARAKIRI_PUBLIC_API_URL
export HARAKIRI_PUBLIC_KEYCLOAK_URL
export HARAKIRI_SANDBOX_ROUTE_DOMAIN
export HARAKIRI_SANDBOX_ROUTE_SCHEME
export HARAKIRI_KEYCLOAK_ISSUER_ALLOWLIST
export HARAKIRI_BUILD_OPEN_SANDBOX_INGRESS
export HARAKIRI_INSTALL_INGRESS_NGINX

bash "${ROOT}/infra/scripts/deploy-k0s.sh"
