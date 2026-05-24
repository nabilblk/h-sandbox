#!/usr/bin/env bash
set -euo pipefail

workspace="${OPEN_HARAKIRI_WORKSPACE:-/workspace}"

required_commands=(
  agent-browser
  bash
  bun
  chromium
  code-server
  curl
  find
  git
  grep
  jq
  node
  npm
  pnpm
  ps
  python3
  rg
  yarn
)

for command_name in "${required_commands[@]}"; do
  command -v "${command_name}" >/dev/null
done

node --version
npm --version
bun --version
pnpm --version
yarn --version
git --version
jq --version
python3 --version
chromium --version
code-server --version | head -n 1
agent-browser --version || true

test -w "${workspace}"
printf 'ok\n' >"${workspace}/.harakiri-open-agents-smoke"
grep -q "ok" "${workspace}/.harakiri-open-agents-smoke"

browser_output="$(mktemp)"
browser_error="$(mktemp)"
if ! chromium \
  --headless \
  --no-sandbox \
  --disable-gpu \
  --dump-dom 'data:text/html,<title>ok</title><main>harakiri-open-agents</main>' \
  >"${browser_output}" \
  2>"${browser_error}"; then
  cat "${browser_error}" >&2
  exit 1
fi
grep -q "harakiri-open-agents" "${browser_output}"
rm -f "${browser_output}" "${browser_error}"

echo "harakiri open-agents smoke passed"
