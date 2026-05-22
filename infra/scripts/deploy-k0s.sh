#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VM_NAME="${K0S_LIMA_VM:-harakiri-k0s}"
export KUBECONFIG="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"

docker build -t harakiri-api:dev -f "${ROOT}/apps/api/Dockerfile" "${ROOT}"
docker build -t harakiri-web:dev -f "${ROOT}/apps/web/Dockerfile" "${ROOT}"

docker save harakiri-api:dev | limactl shell "${VM_NAME}" -- sudo k0s ctr images import -
docker save harakiri-web:dev | limactl shell "${VM_NAME}" -- sudo k0s ctr images import -

kubectl apply -k "${ROOT}/infra/k8s"
kubectl -n harakiri rollout restart deploy/harakiri-api deploy/harakiri-web deploy/harakiri-scheduler
kubectl -n keycloak rollout restart deploy/keycloak

if ! helm status opensandbox -n opensandbox-system >/dev/null 2>&1; then
  helm upgrade --install opensandbox \
    https://github.com/alibaba/OpenSandbox/releases/download/helm%2Fopensandbox%2F0.1.0/opensandbox-0.1.0.tgz \
    --namespace opensandbox-system \
    --create-namespace || {
      echo "OpenSandbox chart install failed; continuing with Harakiri adapter fallback enabled." >&2
    }
fi

kubectl rollout status deploy/harakiri-postgres -n harakiri --timeout=180s
kubectl rollout status deploy/keycloak -n keycloak --timeout=240s || true
kubectl rollout status deploy/harakiri-api -n harakiri --timeout=240s
kubectl rollout status deploy/harakiri-web -n harakiri --timeout=180s
kubectl rollout status deploy/harakiri-scheduler -n harakiri --timeout=180s

echo "deployment complete"
echo "API: kubectl -n harakiri port-forward svc/harakiri-api 18082:8080"
echo "Web: kubectl -n harakiri port-forward svc/harakiri-web 15173:80"
