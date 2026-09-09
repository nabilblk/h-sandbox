#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VM_NAME="${K0S_LIMA_VM:-harakiri-k0s}"
KUBECONFIG_PATH="${K0S_KUBECONFIG:-${ROOT}/infra/k0s/harakiri.kubeconfig}"
LIMA_CONFIG="${K0S_LIMA_CONFIG:-${ROOT}/infra/k0s/lima.yaml}"
API_PORT="${K0S_API_PORT:-6444}"
K0S_VERSION="${K0S_VERSION:-v1.36.3+k0s.2}"
umask 077

if [[ "${VM_NAME}" != harakiri-k0s && -z "${K0S_KUBECONFIG:-}" ]]; then
  echo "A separate VM requires K0S_KUBECONFIG; do not overwrite the lab kubeconfig." >&2
  exit 1
fi
if [[ ! "${API_PORT}" =~ ^[0-9]+$ ]] || (( API_PORT < 1024 || API_PORT > 65535 )); then
  echo "K0S_API_PORT must be an unprivileged TCP port." >&2
  exit 1
fi

if ! command -v limactl >/dev/null; then
  echo "limactl is required. Install Lima first." >&2
  exit 1
fi

if ! command -v kubectl >/dev/null; then
  echo "kubectl is required." >&2
  exit 1
fi

if ! limactl list --format '{{.Name}}' | grep -qx "${VM_NAME}"; then
  limactl create --name "${VM_NAME}" --tty=false "${LIMA_CONFIG}"
fi

state="$(limactl list --format '{{.Name}} {{.Status}}' | awk -v name="${VM_NAME}" '$1 == name {print $2}')"
if [ "${state}" != "Running" ]; then
  limactl start "${VM_NAME}"
fi

limactl shell "${VM_NAME}" -- env K0S_VERSION="${K0S_VERSION}" bash -lc '
  set -euo pipefail
  if ! command -v k0s >/dev/null; then
    curl -sSLf https://get.k0s.sh | sudo env K0S_VERSION="$K0S_VERSION" sh
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

mkdir -p "$(dirname "${KUBECONFIG_PATH}")"
limactl shell "${VM_NAME}" -- sudo k0s kubeconfig admin > "${KUBECONFIG_PATH}"
chmod 600 "${KUBECONFIG_PATH}"
cluster="$(kubectl --kubeconfig "${KUBECONFIG_PATH}" config view --minify -o jsonpath='{.clusters[0].name}')"
kubectl --kubeconfig "${KUBECONFIG_PATH}" config set-cluster "${cluster}" \
  --server="https://127.0.0.1:${API_PORT}" >/dev/null

export KUBECONFIG="${KUBECONFIG_PATH}"
kubectl wait --for=condition=Ready node --all --timeout=180s

kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.32/deploy/local-path-storage.yaml
kubectl patch storageclass local-path -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}' >/dev/null || true

echo "k0s cluster ready"
echo "export KUBECONFIG=${KUBECONFIG_PATH}"
