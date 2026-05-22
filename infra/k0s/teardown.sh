#!/usr/bin/env bash
set -euo pipefail

VM_NAME="${K0S_LIMA_VM:-harakiri-k0s}"

if limactl list --format '{{.Name}}' | grep -qx "${VM_NAME}"; then
  limactl delete -f "${VM_NAME}"
fi

