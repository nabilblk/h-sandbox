#!/usr/bin/env bash
set -euo pipefail

normalize_host() {
  local raw="${1#http://}"
  raw="${raw#https://}"
  raw="${raw%%/*}"
  printf "%s" "$raw"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf "ERROR: %s not found on PATH\n" "$1" >&2
    exit 1
  }
}

: "${CLIENT_REGISTRY_URL:?set the destination registry origin}"
: "${CLIENT_REGISTRY_USERNAME:?set CLIENT_REGISTRY_USERNAME}"
: "${CLIENT_REGISTRY_PASSWORD:?set CLIENT_REGISTRY_PASSWORD}"
: "${HARBOR_PROJECT:=harakiri}"
: "${OPEN_SANDBOX_UPSTREAM_CHART:=https://github.com/opensandbox-group/OpenSandbox/releases/download/helm/opensandbox/0.2.2/opensandbox-0.2.2.tgz}"
: "${OPEN_SANDBOX_CHART_VERSION:=0.2.2}"

CLIENT_REGISTRY="$(normalize_host "$CLIENT_REGISTRY_URL")"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

require_command helm
printf "%s" "$CLIENT_REGISTRY_PASSWORD" | helm registry login "$CLIENT_REGISTRY" \
  --username "$CLIENT_REGISTRY_USERNAME" \
  --password-stdin >/dev/null

helm pull "$OPEN_SANDBOX_UPSTREAM_CHART" --destination "$WORK_DIR"

helm push "$WORK_DIR/opensandbox-${OPEN_SANDBOX_CHART_VERSION}.tgz" \
  "oci://${CLIENT_REGISTRY}/${HARBOR_PROJECT}/charts"

printf "Published OpenSandbox chart: oci://%s/%s/charts/opensandbox:%s\n" \
  "$CLIENT_REGISTRY" "$HARBOR_PROJECT" "$OPEN_SANDBOX_CHART_VERSION"
