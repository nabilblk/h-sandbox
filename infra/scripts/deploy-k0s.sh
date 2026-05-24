#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VM_NAME="${K0S_LIMA_VM:-harakiri-k0s}"
export KUBECONFIG="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"

docker build -t harakiri-api:dev -f "${ROOT}/apps/api/Dockerfile" "${ROOT}"
docker build -t harakiri-web:dev -f "${ROOT}/apps/web/Dockerfile" "${ROOT}"

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

helm upgrade --install opensandbox \
  https://github.com/alibaba/OpenSandbox/releases/download/helm%2Fopensandbox%2F0.1.0/opensandbox-0.1.0.tgz \
  --namespace opensandbox-system \
  --create-namespace \
  -f "${ROOT}/infra/k8s/opensandbox/opensandbox-values.yaml" || {
    echo "OpenSandbox chart install failed; continuing with the currently installed release." >&2
  }

kubectl apply -k "${ROOT}/infra/k8s"
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
kubectl rollout status deploy/keycloak -n keycloak --timeout=240s || true
kubectl rollout status deploy/harakiri-api -n harakiri --timeout=240s
kubectl rollout status deploy/harakiri-web -n harakiri --timeout=180s
kubectl rollout status deploy/harakiri-scheduler -n harakiri --timeout=180s
kubectl rollout status deploy/harakiri-template-builder -n harakiri --timeout=180s
kubectl rollout status deploy/opensandbox-ingress-gateway -n opensandbox-system --timeout=180s || true

echo "deployment complete"
echo "API: kubectl -n harakiri port-forward svc/harakiri-api 18082:8080"
echo "Web: kubectl -n harakiri port-forward svc/harakiri-web 15173:80"
echo "OpenSandbox gateway: kubectl -n opensandbox-system port-forward svc/opensandbox-ingress-gateway 18085:80"
