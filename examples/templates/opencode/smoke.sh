#!/usr/bin/env bash
set -euo pipefail

workspace="${OPEN_HARAKIRI_WORKSPACE:-/workspace}"
port="${OPENCODE_SMOKE_PORT:-4096}"
log_file="/tmp/harakiri-opencode-smoke.log"

required_commands=(
  bash
  curl
  fd
  git
  jq
  node
  npm
  opencode
  pnpm
  python3
  rg
  yarn
)

for command_name in "${required_commands[@]}"; do
  command -v "${command_name}" >/dev/null
done

node --version
npm --version
pnpm --version
yarn --version
opencode --version
opencode run --help >/dev/null 2>&1
opencode serve --help >/dev/null 2>&1

test -w "${workspace}"
printf 'ok\n' >"${workspace}/.harakiri-opencode-smoke"
grep -q "ok" "${workspace}/.harakiri-opencode-smoke"

OPENCODE_SERVER_USERNAME=opencode \
OPENCODE_SERVER_PASSWORD=harakiri-smoke \
  opencode serve --hostname 127.0.0.1 --port "${port}" >"${log_file}" 2>&1 &
server_pid="$!"

cleanup() {
  kill "${server_pid}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  if curl -fsS -u opencode:harakiri-smoke "http://127.0.0.1:${port}/global/health" 2>/dev/null \
      | jq -e '.healthy == true and (.version | type == "string")' >/dev/null; then
    echo "harakiri opencode smoke passed"
    exit 0
  fi
  sleep 0.25
done

cat "${log_file}" >&2 || true
echo "opencode server did not become healthy" >&2
exit 1
