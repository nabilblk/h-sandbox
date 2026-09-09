#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VM_NAME="${K0S_LIMA_VM:-harakiri-k0s}"
export KUBECONFIG="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
SYSTEM_API_IMAGE="127.0.0.1:5000/harakiri/system/api:dev"
SYSTEM_WEB_IMAGE="127.0.0.1:5000/harakiri/system/web:dev"
TMP_DIR="$(mktemp -d)"
OPEN_SANDBOX_CHART_URL="${HARAKIRI_OPEN_SANDBOX_CHART_URL:-https://github.com/opensandbox-group/OpenSandbox/releases/download/helm/opensandbox/0.2.2/opensandbox-0.2.2.tgz}"
HARAKIRI_OPEN_SANDBOX_SNAPSHOT_REGISTRY="${HARAKIRI_OPEN_SANDBOX_SNAPSHOT_REGISTRY:-}"
HARAKIRI_OPEN_SANDBOX_SNAPSHOT_REGISTRY_INSECURE="${HARAKIRI_OPEN_SANDBOX_SNAPSHOT_REGISTRY_INSECURE:-true}"
HARAKIRI_OPEN_SANDBOX_CONTAINERD_SOCKET="${HARAKIRI_OPEN_SANDBOX_CONTAINERD_SOCKET:-/run/k0s/containerd.sock}"
HARAKIRI_OPEN_SANDBOX_SOCKET_COMPAT="${HARAKIRI_OPEN_SANDBOX_SOCKET_COMPAT:-1}"
HARAKIRI_CREDENTIAL_VAULT_KEY_ID="${HARAKIRI_CREDENTIAL_VAULT_KEY_ID:-local-v1}"

cluster_config_value() {
  local key="$1"
  kubectl -n harakiri get configmap harakiri-config -o "jsonpath={.data.${key}}" 2>/dev/null || true
}

existing_secret_value() {
  local key="$1"
  local encoded
  encoded="$(kubectl -n harakiri get secret harakiri-api -o "jsonpath={.data.${key}}" 2>/dev/null || true)"
  if [[ -n "${encoded}" ]]; then
    node -e 'process.stdout.write(Buffer.from(process.argv[1], "base64").toString("utf8"))' "${encoded}"
  fi
}

credential_vault_key() {
  local existing
  existing="$(existing_secret_value CREDENTIAL_VAULT_KEY)"
  if [[ -n "${existing}" ]]; then
    printf '%s' "${existing}"
    return
  fi
  node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64"))'
}

EXISTING_PUBLIC_API_URL="$(cluster_config_value PUBLIC_API_URL)"
# A failed cluster read must not turn an existing public install into a fresh dev install.
EXISTING_PUBLIC_WEB_URL="$(kubectl -n harakiri get configmap harakiri-config --ignore-not-found -o 'jsonpath={.data.PUBLIC_WEB_URL}')"
EXISTING_PUBLIC_KEYCLOAK_URL="$(cluster_config_value PUBLIC_KEYCLOAK_URL)"
EXISTING_PUBLIC_KEYCLOAK_REALM="$(cluster_config_value PUBLIC_KEYCLOAK_REALM)"
EXISTING_PUBLIC_KEYCLOAK_CLIENT_ID="$(cluster_config_value PUBLIC_KEYCLOAK_CLIENT_ID)"
EXISTING_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO="$(cluster_config_value PUBLIC_KEYCLOAK_SILENT_CHECK_SSO)"
EXISTING_PUBLIC_OPEN_SANDBOX_URL="$(cluster_config_value PUBLIC_OPEN_SANDBOX_URL)"
EXISTING_SANDBOX_ROUTE_DOMAIN="$(cluster_config_value SANDBOX_ROUTE_BASE_DOMAIN)"
EXISTING_SANDBOX_ROUTE_SCHEME="$(cluster_config_value SANDBOX_ROUTE_PUBLIC_SCHEME)"
EXISTING_KEYCLOAK_ISSUER_ALLOWLIST="$(cluster_config_value KEYCLOAK_ISSUER_ALLOWLIST)"

HARAKIRI_PUBLIC_API_URL="${HARAKIRI_PUBLIC_API_URL:-${EXISTING_PUBLIC_API_URL:-http://127.0.0.1:18082}}"
HARAKIRI_PUBLIC_WEB_URL="${HARAKIRI_PUBLIC_WEB_URL:-${EXISTING_PUBLIC_WEB_URL:-http://127.0.0.1:15173}}"
HARAKIRI_PUBLIC_KEYCLOAK_URL="${HARAKIRI_PUBLIC_KEYCLOAK_URL:-${EXISTING_PUBLIC_KEYCLOAK_URL:-http://127.0.0.1:18084}}"
node "${ROOT}/infra/scripts/check-local-deploy.mjs" \
  "${EXISTING_PUBLIC_WEB_URL}" "${EXISTING_PUBLIC_API_URL}" "${EXISTING_PUBLIC_KEYCLOAK_URL}" \
  "${HARAKIRI_PUBLIC_WEB_URL}" "${HARAKIRI_PUBLIC_API_URL}" "${HARAKIRI_PUBLIC_KEYCLOAK_URL}"
HARAKIRI_PUBLIC_KEYCLOAK_REALM="${HARAKIRI_PUBLIC_KEYCLOAK_REALM:-${EXISTING_PUBLIC_KEYCLOAK_REALM:-harakiri}}"
HARAKIRI_PUBLIC_KEYCLOAK_CLIENT_ID="${HARAKIRI_PUBLIC_KEYCLOAK_CLIENT_ID:-${EXISTING_PUBLIC_KEYCLOAK_CLIENT_ID:-harakiri-web}}"
HARAKIRI_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO="${HARAKIRI_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO:-${EXISTING_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO:-false}}"
if [[ -z "${HARAKIRI_PUBLIC_OPEN_SANDBOX_URL+x}" ]]; then
  HARAKIRI_PUBLIC_OPEN_SANDBOX_URL="${EXISTING_PUBLIC_OPEN_SANDBOX_URL:-http://127.0.0.1:18083}"
fi
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
HARAKIRI_CREDENTIAL_VAULT_KEY="${HARAKIRI_CREDENTIAL_VAULT_KEY:-$(credential_vault_key)}"
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

default_snapshot_registry() {
  local node_ip
  node_ip="$(limactl shell "${VM_NAME}" -- sh -lc "ip -4 route get 1.1.1.1 | sed -n 's/.* src \\([0-9.]*\\).*/\\1/p' | head -1")"
  if [[ -z "${node_ip}" ]]; then
    echo "Could not determine the k0s node IP for the local snapshot registry." >&2
    exit 1
  fi
  printf "%s:5000/harakiri/snapshots" "${node_ip}"
}

prepare_opensandbox_snapshot_runtime() {
  local default_socket="/var/run/containerd/containerd.sock"
  if [[ "${HARAKIRI_OPEN_SANDBOX_SOCKET_COMPAT}" != "1" ]]; then
    return
  fi
  if [[ "${HARAKIRI_OPEN_SANDBOX_CONTAINERD_SOCKET}" == "${default_socket}" ]]; then
    return
  fi
  limactl shell "${VM_NAME}" -- sudo sh -s -- "${HARAKIRI_OPEN_SANDBOX_CONTAINERD_SOCKET}" "${default_socket}" <<'EOF'
set -eu
source_socket="$1"
default_socket="$2"
if [ ! -S "${source_socket}" ]; then
  echo "OpenSandbox snapshot socket ${source_socket} was not found on the k0s node." >&2
  exit 1
fi
if [ -S "${default_socket}" ]; then
  exit 0
fi
if [ -L "${default_socket}" ]; then
  rm "${default_socket}"
elif [ -d "${default_socket}" ]; then
  rmdir "${default_socket}"
elif [ -e "${default_socket}" ]; then
  echo "Cannot replace non-socket ${default_socket}; remove it or set HARAKIRI_OPEN_SANDBOX_SOCKET_COMPAT=0." >&2
  exit 1
fi
mkdir -p "$(dirname "${default_socket}")"
ln -s "${source_socket}" "${default_socket}"
EOF
}

docker build --provenance=false --sbom=false -t harakiri-api:dev -f "${ROOT}/apps/api/Dockerfile" "${ROOT}"
docker build \
  --provenance=false \
  --sbom=false \
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

if [[ "${HARAKIRI_BUILD_OPEN_SANDBOX_INGRESS:-0}" == "1" ]]; then
  OSBX_SRC="${HARAKIRI_OPEN_SANDBOX_SRC:-}"
  if [[ -z "${OSBX_SRC}" ]]; then
    OSBX_SRC="$(mktemp -d)/OpenSandbox"
    git clone --depth 1 https://github.com/opensandbox-group/OpenSandbox.git "${OSBX_SRC}"
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

if [[ -z "${HARAKIRI_OPEN_SANDBOX_SNAPSHOT_REGISTRY}" ]]; then
  HARAKIRI_OPEN_SANDBOX_SNAPSHOT_REGISTRY="$(default_snapshot_registry)"
fi

prepare_opensandbox_snapshot_runtime

OSBX_VALUES_OVERRIDE="${TMP_DIR}/opensandbox-values.override.yaml"
cat >"${OSBX_VALUES_OVERRIDE}" <<EOF
opensandbox-controller:
  controller:
    snapshot:
      registry: ${HARAKIRI_OPEN_SANDBOX_SNAPSHOT_REGISTRY}
      registryInsecure: ${HARAKIRI_OPEN_SANDBOX_SNAPSHOT_REGISTRY_INSECURE}
opensandbox-server:
  server:
    gateway:
      host: ${HARAKIRI_SANDBOX_ROUTE_DOMAIN}
EOF

helm upgrade --install opensandbox \
  "${OPEN_SANDBOX_CHART_URL}" \
  --namespace opensandbox-system \
  --create-namespace \
  -f "${ROOT}/infra/k8s/opensandbox/opensandbox-values.yaml" \
  -f "${OSBX_VALUES_OVERRIDE}" || {
    echo "OpenSandbox chart install failed; continuing with the currently installed release." >&2
  }

kubectl apply -f "${ROOT}/infra/k8s/base/namespace.yaml"
kubectl apply -f "${ROOT}/infra/k8s/postgres/postgres.yaml"
kubectl apply -f "${ROOT}/infra/k8s/keycloak/keycloak.yaml"
kubectl apply -f "${ROOT}/infra/k8s/opensandbox/harakiri-exec-rbac.yaml"
kubectl apply -f "${ROOT}/infra/k8s/opensandbox/opensandbox-server-diagnostics-rbac.yaml"
kubectl apply -f "${ROOT}/infra/k8s/opensandbox/sandbox-gateway-rbac.yaml"
kubectl apply -f "${ROOT}/infra/k8s/opensandbox/sandbox-wildcard-ingress.yaml"

if ! helm status harakiri -n harakiri >/dev/null 2>&1; then
  kubectl -n harakiri delete \
    deploy/harakiri-api \
    deploy/harakiri-scheduler \
    deploy/harakiri-template-builder \
    deploy/harakiri-web \
    deploy/harakiri-registry \
    svc/harakiri-api \
    svc/harakiri-web \
    svc/harakiri-registry \
    configmap/harakiri-config \
    secret/harakiri-api \
    role/harakiri-template-builder \
    rolebinding/harakiri-template-builder \
    serviceaccount/harakiri \
    --ignore-not-found
  kubectl delete \
    clusterrole/harakiri-template-prepull \
    clusterrolebinding/harakiri-template-prepull \
    --ignore-not-found
fi

HARAKIRI_VALUES_OVERRIDE="${TMP_DIR}/harakiri-values.override.yaml"
cat >"${HARAKIRI_VALUES_OVERRIDE}" <<EOF
image:
  registry: 127.0.0.1:5000
  repository: harakiri/system
  api:
    name: api
    tag: dev
  web:
    name: web
    tag: dev
secret:
  data:
    DATABASE_URL: postgres://harakiri:harakiri@harakiri-postgres.harakiri.svc.cluster.local:5432/harakiri
    OPEN_SANDBOX_API_KEY: dev-opensandbox-key
    KEYCLOAK_ADMIN_USERNAME: admin
    KEYCLOAK_ADMIN_PASSWORD: admin
    CREDENTIAL_VAULT_KEY: ${HARAKIRI_CREDENTIAL_VAULT_KEY}
credentialVault:
  encryption:
    keyId: ${HARAKIRI_CREDENTIAL_VAULT_KEY_ID}
  externalSecrets:
    kubernetes:
      enabled: true
      defaultNamespace: harakiri
      allowedNamespaces:
        - harakiri
      allowedNamePrefixes:
        - harakiri-vault-
config:
  PUBLIC_API_URL: ${HARAKIRI_PUBLIC_API_URL}
  PUBLIC_WEB_URL: ${HARAKIRI_PUBLIC_WEB_URL}
  PUBLIC_KEYCLOAK_URL: ${HARAKIRI_PUBLIC_KEYCLOAK_URL}
  PUBLIC_KEYCLOAK_REALM: ${HARAKIRI_PUBLIC_KEYCLOAK_REALM}
  PUBLIC_KEYCLOAK_CLIENT_ID: ${HARAKIRI_PUBLIC_KEYCLOAK_CLIENT_ID}
  PUBLIC_KEYCLOAK_SILENT_CHECK_SSO: "${HARAKIRI_PUBLIC_KEYCLOAK_SILENT_CHECK_SSO}"
  PUBLIC_OPEN_SANDBOX_URL: ${HARAKIRI_PUBLIC_OPEN_SANDBOX_URL}
  SANDBOX_ROUTE_MODE: opensandbox-gateway
  SANDBOX_ROUTE_BASE_DOMAIN: ${HARAKIRI_SANDBOX_ROUTE_DOMAIN}
  SANDBOX_ROUTE_PUBLIC_SCHEME: ${HARAKIRI_SANDBOX_ROUTE_SCHEME}
  SANDBOX_ROUTE_LOCAL_FALLBACK_URL: http://127.0.0.1:18083
  SANDBOX_MAX_ROUTES_PER_SANDBOX: "8"
  SANDBOX_MAX_ROUTES_PER_ORG: "200"
  SANDBOX_FILE_ARTIFACT_MAX_BYTES: "16777216"
  TEMPLATE_MAX_CPU_COUNT: "8"
  TEMPLATE_MAX_MEMORY_MB: "32768"
  TEMPLATE_MAX_DEFAULT_PORTS: "16"
  TEMPLATE_BUILD_MAX_ACTIVE_PER_ORG: "3"
  TEMPLATE_IMAGE_ALLOW_REGISTRIES: docker.io,registry-1.docker.io,mcr.microsoft.com,gcr.io,ghcr.io,127.0.0.1:5000,harakiri-registry.harakiri.svc.cluster.local:5000
  TEMPLATE_IMAGE_DENY_REGISTRIES: ""
  TEMPLATE_IMAGE_ALLOW_PREFIXES: ""
  TEMPLATE_IMAGE_DENY_PREFIXES: ""
  TEMPLATE_BUILD_CONTEXT_MAX_BYTES: "26214400"
  TEMPLATE_BUILDER_NAMESPACE: harakiri
  TEMPLATE_BUILDER_JOB_IMAGE: ${SYSTEM_API_IMAGE}
  TEMPLATE_DOCKERFILE_BUILDER: buildkit
  TEMPLATE_BUILDKIT_IMAGE: moby/buildkit:rootless
  TEMPLATE_BUILDKITD_FLAGS: "--oci-worker-no-process-sandbox"
  TEMPLATE_BUILDKIT_REGISTRY_INSECURE: "1"
  TEMPLATE_LEGACY_DOCKERFILE_BUILDER_IMAGE: gcr.io/kaniko-project/executor:v1.24.0
  TEMPLATE_BUILDER_JOB_TIMEOUT_MS: "900000"
  TEMPLATE_REGISTRY_PUSH_HOST: harakiri-registry.harakiri.svc.cluster.local:5000
  TEMPLATE_REGISTRY_RUNTIME_HOST: 127.0.0.1:5000
  TEMPLATE_REGISTRY_REPOSITORY_PREFIX: harakiri/templates
  TEMPLATE_REGISTRY_CREDENTIAL_KEY: harakiri-local-registry-credential-key
  TEMPLATE_SCANNER_WEBHOOK_URL: ""
  TEMPLATE_SCANNER_TIMEOUT_MS: "10000"
  TEMPLATE_SCANNER_FAIL_ON_ERROR: "0"
  TEMPLATE_RUNTIME_PULL_PREFLIGHT_ENABLED: "1"
  TEMPLATE_RUNTIME_PULL_PREFLIGHT_NAMESPACE: opensandbox
  TEMPLATE_RUNTIME_PULL_PREFLIGHT_TIMEOUT_MS: "120000"
  TEMPLATE_IMAGE_PREPULL_ENABLED: "1"
  TEMPLATE_IMAGE_PREPULL_NAMESPACE: opensandbox
  TEMPLATE_IMAGE_PREPULL_TIMEOUT_MS: "120000"
  TEMPLATE_IMAGE_PREPULL_HOT_TAGS: hot,prepull,warm
  TEMPLATE_IMAGE_PREPULL_FAIL_ON_ERROR: "0"
  TEMPLATE_RETENTION_ENABLED: "1"
  TEMPLATE_RETENTION_INTERVAL_MS: "3600000"
  TEMPLATE_BUILD_RETENTION_DAYS: "30"
  TEMPLATE_BUILD_LOG_RETENTION_DAYS: "14"
  TEMPLATE_BUILD_CONTEXT_RETENTION_DAYS: "7"
  TEMPLATE_VERSION_RETENTION_DAYS: "90"
  TEMPLATE_BUILDER_JOB_RETENTION_DAYS: "1"
  TEMPLATE_RETENTION_DELETE_BUILDER_JOBS: "1"
  TEMPLATE_BUILDER_POLL_MS: "5000"
  KEYCLOAK_ISSUER: http://keycloak.keycloak.svc.cluster.local:8080/realms/harakiri
  KEYCLOAK_AUDIENCE: "harakiri-api"
  KEYCLOAK_SIGNING_ALGORITHMS: "RS256"
  KEYCLOAK_ISSUER_ALLOWLIST: ${HARAKIRI_KEYCLOAK_ISSUER_ALLOWLIST}
  KEYCLOAK_JWKS_URL: http://keycloak.keycloak.svc.cluster.local:8080/realms/harakiri/protocol/openid-connect/certs
  KEYCLOAK_INVITATION_REDIRECT_URI: ${HARAKIRI_KEYCLOAK_INVITATION_REDIRECT_URI}
  OPEN_SANDBOX_BASE_URL: http://opensandbox-server.opensandbox-system.svc.cluster.local:80
  OPEN_SANDBOX_GATEWAY_URL: http://opensandbox-ingress-gateway.opensandbox-system.svc.cluster.local:80
  OPEN_SANDBOX_ALLOW_FALLBACK: "0"
  OPEN_SANDBOX_SEND_OPEN_NETWORK_POLICY: "1"
  AUTH_DEV_ALLOW: "0"
  AUTO_MIGRATE: "1"
  SEED_ON_BOOT: "0"
EOF

helm upgrade --install harakiri \
  "${ROOT}/infra/charts/harakiri" \
  --namespace harakiri \
  --create-namespace \
  -f "${HARAKIRI_VALUES_OVERRIDE}"

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
