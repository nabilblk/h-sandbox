#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VM_NAME="${K0S_LIMA_VM:-harakiri-k0s}"
KUBECONFIG_PATH="${ROOT}/infra/k0s/harakiri.kubeconfig"

if ! command -v limactl >/dev/null; then
  echo "limactl is required. Install Lima first." >&2
  exit 1
fi

if ! command -v kubectl >/dev/null; then
  echo "kubectl is required." >&2
  exit 1
fi

if ! limactl list --format '{{.Name}}' | grep -qx "${VM_NAME}"; then
  limactl create --name "${VM_NAME}" --tty=false "${ROOT}/infra/k0s/lima.yaml"
fi

state="$(limactl list --format '{{.Name}} {{.Status}}' | awk -v name="${VM_NAME}" '$1 == name {print $2}')"
if [ "${state}" != "Running" ]; then
  limactl start "${VM_NAME}"
fi

limactl shell "${VM_NAME}" -- bash -lc '
  set -euo pipefail
  if ! command -v k0s >/dev/null; then
    curl -sSLf https://get.k0s.sh | sudo sh
  fi
  if [ ! -f /etc/systemd/system/k0scontroller.service ]; then
    sudo k0s install controller --single --enable-worker
  fi
  sudo systemctl enable --now k0scontroller
  ready=0
  for i in $(seq 1 60); do
    if sudo k0s status >/tmp/k0s-status.txt 2>&1; then
      cat /tmp/k0s-status.txt
      ready=1
      break
    fi
    sudo systemctl status k0scontroller --no-pager || true
    sleep 3
  done
  if [ "${ready}" != "1" ]; then
    cat /tmp/k0s-status.txt >&2 || true
    exit 1
  fi
'

limactl shell "${VM_NAME}" -- sudo k0s kubeconfig admin > "${KUBECONFIG_PATH}"
perl -0pi -e 's#server: https://.*?:6443#server: https://127.0.0.1:6443#' "${KUBECONFIG_PATH}"

export KUBECONFIG="${KUBECONFIG_PATH}"
kubectl wait --for=condition=Ready node --all --timeout=180s

kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.32/deploy/local-path-storage.yaml
kubectl patch storageclass local-path -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}' >/dev/null || true

echo "k0s cluster ready"
echo "export KUBECONFIG=${KUBECONFIG_PATH}"
