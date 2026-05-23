#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export KUBECONFIG="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"

CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.20.2}"
CERT_MANAGER_NAMESPACE="${CERT_MANAGER_NAMESPACE:-cert-manager}"

helm upgrade --install cert-manager oci://quay.io/jetstack/charts/cert-manager \
  --version "${CERT_MANAGER_VERSION}" \
  --namespace "${CERT_MANAGER_NAMESPACE}" \
  --create-namespace \
  --set crds.enabled=true \
  --wait \
  --timeout=5m

kubectl rollout status deploy/cert-manager -n "${CERT_MANAGER_NAMESPACE}" --timeout=180s
kubectl rollout status deploy/cert-manager-cainjector -n "${CERT_MANAGER_NAMESPACE}" --timeout=180s
kubectl rollout status deploy/cert-manager-webhook -n "${CERT_MANAGER_NAMESPACE}" --timeout=180s

echo "cert-manager ${CERT_MANAGER_VERSION} is ready in namespace ${CERT_MANAGER_NAMESPACE}"
