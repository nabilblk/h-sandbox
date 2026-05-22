#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export KUBECONFIG="${KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"

kubectl get nodes -o wide
kubectl get pods -A
kubectl run harakiri-k0s-smoke --image=nginx:1.29-alpine --restart=Never --port=80 >/dev/null 2>&1 || true
kubectl wait --for=condition=Ready pod/harakiri-k0s-smoke --timeout=120s
kubectl delete pod harakiri-k0s-smoke --wait=false
echo "k0s verification passed"

