#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VM_NAME="${K0S_LIMA_VM:-harakiri-k0s}"
export KUBECONFIG="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
SYSTEM_API_IMAGE="127.0.0.1:5000/harakiri/system/api:dev"
SYSTEM_WEB_IMAGE="127.0.0.1:5000/harakiri/system/web:dev"
TMP_DIR="$(mktemp -d)"

cluster_config_value() {
  local key="$1"
  kubectl -n harakiri get configmap harakiri-config -o "jsonpath={.data.${key}}" 2>/dev/null || true
}

EXISTING_PUBLIC_API_URL="$(cluster_config_value PUBLIC_API_URL)"
EXISTING_PUBLIC_WEB_URL="$(cluster_config_value PUBLIC_WEB_URL)"
EXISTING_PUBLIC_KEYCLOAK_URL="$(cluster_config_value PUBLIC_KEYCLOAK_URL)"
EXISTING_PUBLIC_KEYCLOAK_REALM="$(cluster_config_value PUBLIC_KEYCLOAK_REALM)"
EXISTING_PUBLIC_KEYCLOAK_CLIENT_ID="$(cluster_config_value PUBLIC_KEYCLOAK_CLIENT_ID)"
EXISTING_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO="$(cluster_config_value PUBLIC_KEYCLOAK_SILENT_CHECK_SSO)"
EXISTING_SANDBOX_ROUTE_DOMAIN="$(cluster_config_value SANDBOX_ROUTE_BASE_DOMAIN)"
EXISTING_SANDBOX_ROUTE_SCHEME="$(cluster_config_value SANDBOX_ROUTE_PUBLIC_SCHEME)"
EXISTING_KEYCLOAK_ISSUER_ALLOWLIST="$(cluster_config_value KEYCLOAK_ISSUER_ALLOWLIST)"

HARAKIRI_PUBLIC_API_URL="${HARAKIRI_PUBLIC_API_URL:-${EXISTING_PUBLIC_API_URL:-http://127.0.0.1:18082}}"
HARAKIRI_PUBLIC_WEB_URL="${HARAKIRI_PUBLIC_WEB_URL:-${EXISTING_PUBLIC_WEB_URL:-http://127.0.0.1:15173}}"
HARAKIRI_PUBLIC_KEYCLOAK_URL="${HARAKIRI_PUBLIC_KEYCLOAK_URL:-${EXISTING_PUBLIC_KEYCLOAK_URL:-http://127.0.0.1:18084}}"
HARAKIRI_PUBLIC_KEYCLOAK_REALM="${HARAKIRI_PUBLIC_KEYCLOAK_REALM:-${EXISTING_PUBLIC_KEYCLOAK_REALM:-harakiri}}"
HARAKIRI_PUBLIC_KEYCLOAK_CLIENT_ID="${HARAKIRI_PUBLIC_KEYCLOAK_CLIENT_ID:-${EXISTING_PUBLIC_KEYCLOAK_CLIENT_ID:-harakiri-web}}"
HARAKIRI_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO="${HARAKIRI_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO:-${EXISTING_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO:-false}}"
HARAKIRI_SANDBOX_ROUTE_DOMAIN="${HARAKIRI_SANDBOX_ROUTE_DOMAIN:-${EXISTING_SANDBOX_ROUTE_DOMAIN:-sandbox.localhost}}"
HARAKIRI_SANDBOX_ROUTE_SCHEME="${HARAKIRI_SANDBOX_ROUTE_SCHEME:-${EXISTING_SANDBOX_ROUTE_SCHEME:-https}}"
HARAKIRI_KEYCLOAK_ISSUER_ALLOWLIST="${HARAKIRI_KEYCLOAK_ISSUER_ALLOWLIST:-${EXISTING_KEYCLOAK_ISSUER_ALLOWLIST:-http://keycloak.keycloak.svc.cluster.local:8080/realms/harakiri,http://127.0.0.1:18084/realms/harakiri,${HARAKIRI_PUBLIC_KEYCLOAK_URL}/realms/harakiri}}"
HARAKIRI_KEYCLOAK_INVITATION_REDIRECT_URI="${HARAKIRI_KEYCLOAK_INVITATION_REDIRECT_URI:-${HARAKIRI_PUBLIC_WEB_URL}/#dashboard/sandboxes}"
HARAKIRI_CONFIGURE_KEYCLOAK_PUBLIC_URL="${HARAKIRI_CONFIGURE_KEYCLOAK_PUBLIC_URL:-1}"
HARAKIRI_CONFIGURE_KEYCLOAK_SMTP="${HARAKIRI_CONFIGURE_KEYCLOAK_SMTP:-1}"
HARAKIRI_KEYCLOAK_SMTP_HOST="${HARAKIRI_KEYCLOAK_SMTP_HOST:-mailpit.keycloak.svc.cluster.local}"
HARAKIRI_KEYCLOAK_SMTP_PORT="${HARAKIRI_KEYCLOAK_SMTP_PORT:-1025}"
HARAKIRI_KEYCLOAK_SMTP_FROM="${HARAKIRI_KEYCLOAK_SMTP_FROM:-no-reply@harakiri.local}"
HARAKIRI_KEYCLOAK_SMTP_FROM_DISPLAY="${HARAKIRI_KEYCLOAK_SMTP_FROM_DISPLAY:-Harakiri}"
HARAKIRI_KEYCLOAK_SMTP_AUTH="${HARAKIRI_KEYCLOAK_SMTP_AUTH:-false}"
HARAKIRI_KEYCLOAK_SMTP_USER="${HARAKIRI_KEYCLOAK_SMTP_USER:-}"
HARAKIRI_KEYCLOAK_SMTP_PASSWORD="${HARAKIRI_KEYCLOAK_SMTP_PASSWORD:-}"
HARAKIRI_KEYCLOAK_SMTP_STARTTLS="${HARAKIRI_KEYCLOAK_SMTP_STARTTLS:-false}"
HARAKIRI_KEYCLOAK_SMTP_SSL="${HARAKIRI_KEYCLOAK_SMTP_SSL:-false}"
export HARAKIRI_ROUTE_DOMAIN="${HARAKIRI_ROUTE_DOMAIN:-${HARAKIRI_SANDBOX_ROUTE_DOMAIN}}"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

push_system_image() {
  local source_ref="$1"
  local target_ref="$2"
  limactl shell "${VM_NAME}" -- sudo k0s ctr -n k8s.io images tag --force "${source_ref}" "${target_ref}"
  limactl shell "${VM_NAME}" -- sudo k0s ctr -n k8s.io images push --plain-http "${target_ref}"
}

docker build -t harakiri-api:dev -f "${ROOT}/apps/api/Dockerfile" "${ROOT}"
docker build \
  --build-arg "VITE_PUBLIC_API_URL=${HARAKIRI_PUBLIC_API_URL}" \
  --build-arg "VITE_PUBLIC_KEYCLOAK_URL=${HARAKIRI_PUBLIC_KEYCLOAK_URL}" \
  --build-arg "VITE_PUBLIC_KEYCLOAK_REALM=${HARAKIRI_PUBLIC_KEYCLOAK_REALM}" \
  --build-arg "VITE_PUBLIC_KEYCLOAK_CLIENT_ID=${HARAKIRI_PUBLIC_KEYCLOAK_CLIENT_ID}" \
  --build-arg "VITE_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO=${HARAKIRI_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO}" \
  -t harakiri-web:dev \
  -f "${ROOT}/apps/web/Dockerfile" \
  "${ROOT}"

docker save harakiri-api:dev | limactl shell "${VM_NAME}" -- sudo k0s ctr images import -
docker save harakiri-web:dev | limactl shell "${VM_NAME}" -- sudo k0s ctr images import -

if [[ "${HARAKIRI_BUILD_OPEN_SANDBOX_INGRESS:-1}" == "1" ]]; then
  OSBX_SRC="${HARAKIRI_OPEN_SANDBOX_SRC:-}"
  if [[ -z "${OSBX_SRC}" ]]; then
    OSBX_SRC="$(mktemp -d)/OpenSandbox"
    git clone --depth 1 https://github.com/alibaba/OpenSandbox.git "${OSBX_SRC}"
  fi
  docker build -t opensandbox-ingress:local -f "${OSBX_SRC}/components/ingress/Dockerfile" "${OSBX_SRC}"
  docker save opensandbox-ingress:local | limactl shell "${VM_NAME}" -- sudo k0s ctr images import -
fi

if [[ "${HARAKIRI_INSTALL_INGRESS_NGINX:-1}" == "1" ]]; then
  helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
  helm repo update ingress-nginx >/dev/null 2>&1 || true
  helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx \
    --create-namespace \
    --set controller.replicaCount=1 \
    --set controller.service.type=NodePort \
    --wait \
    --timeout=5m || {
      echo "ingress-nginx install failed; OpenSandbox gateway port-forward tests can still run locally." >&2
    }
fi

if [[ "${HARAKIRI_INSTALL_CERT_MANAGER:-0}" == "1" ]]; then
  "${ROOT}/infra/scripts/cert-manager-install.sh"
fi

OSBX_VALUES_OVERRIDE="${TMP_DIR}/opensandbox-values.override.yaml"
cat >"${OSBX_VALUES_OVERRIDE}" <<EOF
opensandbox-server:
  server:
    gateway:
      host: ${HARAKIRI_SANDBOX_ROUTE_DOMAIN}
EOF

helm upgrade --install opensandbox \
  https://github.com/alibaba/OpenSandbox/releases/download/helm%2Fopensandbox%2F0.1.0/opensandbox-0.1.0.tgz \
  --namespace opensandbox-system \
  --create-namespace \
  -f "${ROOT}/infra/k8s/opensandbox/opensandbox-values.yaml" \
  -f "${OSBX_VALUES_OVERRIDE}" || {
    echo "OpenSandbox chart install failed; continuing with the currently installed release." >&2
  }

kubectl apply -k "${ROOT}/infra/k8s"
kubectl -n harakiri patch configmap harakiri-config --type=merge -p "$(cat <<EOF
{"data":{"PUBLIC_API_URL":"${HARAKIRI_PUBLIC_API_URL}","PUBLIC_WEB_URL":"${HARAKIRI_PUBLIC_WEB_URL}","PUBLIC_KEYCLOAK_URL":"${HARAKIRI_PUBLIC_KEYCLOAK_URL}","PUBLIC_KEYCLOAK_REALM":"${HARAKIRI_PUBLIC_KEYCLOAK_REALM}","PUBLIC_KEYCLOAK_CLIENT_ID":"${HARAKIRI_PUBLIC_KEYCLOAK_CLIENT_ID}","PUBLIC_KEYCLOAK_SILENT_CHECK_SSO":"${HARAKIRI_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO}","KEYCLOAK_INVITATION_REDIRECT_URI":"${HARAKIRI_KEYCLOAK_INVITATION_REDIRECT_URI}","SANDBOX_ROUTE_BASE_DOMAIN":"${HARAKIRI_SANDBOX_ROUTE_DOMAIN}","SANDBOX_ROUTE_PUBLIC_SCHEME":"${HARAKIRI_SANDBOX_ROUTE_SCHEME}","KEYCLOAK_ISSUER_ALLOWLIST":"${HARAKIRI_KEYCLOAK_ISSUER_ALLOWLIST}"}}
EOF
)"
kubectl -n opensandbox-system patch ingress opensandbox-sandbox-routes --type=json -p "$(cat <<EOF
[{"op":"replace","path":"/spec/tls/0/hosts/0","value":"*.${HARAKIRI_SANDBOX_ROUTE_DOMAIN}"},{"op":"replace","path":"/spec/rules/0/host","value":"*.${HARAKIRI_SANDBOX_ROUTE_DOMAIN}"}]
EOF
)"
kubectl rollout status deploy/harakiri-registry -n harakiri --timeout=180s
push_system_image docker.io/library/harakiri-api:dev "${SYSTEM_API_IMAGE}"
push_system_image docker.io/library/harakiri-web:dev "${SYSTEM_WEB_IMAGE}"

case "${HARAKIRI_ROUTE_TLS_MODE:-dev}" in
  dev)
    "${ROOT}/infra/scripts/route-tls-dev-secret.sh"
    ;;
  letsencrypt-cloudflare)
    "${ROOT}/infra/scripts/env/harakiri/route-tls-letsencrypt-cloudflare.sh"
    ;;
  none)
    echo "skipping sandbox route TLS secret creation"
    ;;
  *)
    echo "unknown HARAKIRI_ROUTE_TLS_MODE=${HARAKIRI_ROUTE_TLS_MODE}; expected dev, letsencrypt-cloudflare, or none" >&2
    exit 2
    ;;
esac
kubectl -n harakiri rollout restart deploy/harakiri-api deploy/harakiri-web deploy/harakiri-scheduler deploy/harakiri-template-builder
kubectl -n keycloak rollout restart deploy/keycloak

kubectl rollout status deploy/harakiri-postgres -n harakiri --timeout=180s
kubectl rollout status deploy/harakiri-registry -n harakiri --timeout=180s
kubectl rollout status deploy/mailpit -n keycloak --timeout=120s || true
kubectl rollout status deploy/keycloak -n keycloak --timeout=240s || true

if [[ "${HARAKIRI_CONFIGURE_KEYCLOAK_PUBLIC_URL}" == "1" || "${HARAKIRI_CONFIGURE_KEYCLOAK_SMTP}" == "1" ]]; then
  kubectl -n keycloak exec deploy/keycloak -- /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://127.0.0.1:8080 \
    --realm master \
    --user admin \
    --password admin >/dev/null
fi

if [[ "${HARAKIRI_CONFIGURE_KEYCLOAK_PUBLIC_URL}" == "1" ]]; then
  kubectl -n keycloak exec deploy/keycloak -- /opt/keycloak/bin/kcadm.sh update realms/harakiri \
    -s "attributes.frontendUrl=${HARAKIRI_PUBLIC_KEYCLOAK_URL}" \
    -s loginTheme=harakiri \
    -s emailTheme=harakiri >/dev/null
fi

if [[ "${HARAKIRI_CONFIGURE_KEYCLOAK_SMTP}" == "1" ]]; then
  smtp_args=(
    -s "smtpServer.host=${HARAKIRI_KEYCLOAK_SMTP_HOST}"
    -s "smtpServer.port=${HARAKIRI_KEYCLOAK_SMTP_PORT}"
    -s "smtpServer.from=${HARAKIRI_KEYCLOAK_SMTP_FROM}"
    -s "smtpServer.fromDisplayName=${HARAKIRI_KEYCLOAK_SMTP_FROM_DISPLAY}"
    -s "smtpServer.auth=${HARAKIRI_KEYCLOAK_SMTP_AUTH}"
    -s "smtpServer.ssl=${HARAKIRI_KEYCLOAK_SMTP_SSL}"
    -s "smtpServer.starttls=${HARAKIRI_KEYCLOAK_SMTP_STARTTLS}"
    -s smtpServer.debug=false
  )
  if [[ -n "${HARAKIRI_KEYCLOAK_SMTP_USER}" ]]; then
    smtp_args+=(-s "smtpServer.user=${HARAKIRI_KEYCLOAK_SMTP_USER}")
  fi
  if [[ -n "${HARAKIRI_KEYCLOAK_SMTP_PASSWORD}" ]]; then
    smtp_args+=(-s "smtpServer.password=${HARAKIRI_KEYCLOAK_SMTP_PASSWORD}")
  fi
  kubectl -n keycloak exec deploy/keycloak -- /opt/keycloak/bin/kcadm.sh update realms/harakiri "${smtp_args[@]}" >/dev/null
fi

kubectl rollout status deploy/harakiri-api -n harakiri --timeout=240s
kubectl rollout status deploy/harakiri-web -n harakiri --timeout=180s
kubectl rollout status deploy/harakiri-scheduler -n harakiri --timeout=180s
kubectl rollout status deploy/harakiri-template-builder -n harakiri --timeout=180s
kubectl rollout status deploy/opensandbox-ingress-gateway -n opensandbox-system --timeout=180s || true

echo "deployment complete"
echo "API: kubectl -n harakiri port-forward svc/harakiri-api 18082:8080"
echo "Web: kubectl -n harakiri port-forward svc/harakiri-web 15173:80"
echo "OpenSandbox gateway: kubectl -n opensandbox-system port-forward svc/opensandbox-ingress-gateway 18085:80"
