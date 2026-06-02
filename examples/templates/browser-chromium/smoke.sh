#!/usr/bin/env bash
set -euo pipefail

workspace="${OPEN_HARAKIRI_WORKSPACE:-/workspace}"

required_commands=(
  bash
  chromium
  curl
  git
  jq
  node
  npm
  pnpm
  python3
  rg
)

for command_name in "${required_commands[@]}"; do
  command -v "${command_name}" >/dev/null
done

node --version
npm --version
pnpm --version
chromium --version

browser_output="$(mktemp)"
browser_error="$(mktemp)"
if ! chromium \
  --headless \
  --no-sandbox \
  --disable-gpu \
  --dump-dom 'data:text/html,<title>ok</title><main>harakiri-browser</main>' \
  >"${browser_output}" \
  2>"${browser_error}"; then
  cat "${browser_error}" >&2
  exit 1
fi
grep -q "harakiri-browser" "${browser_output}"
rm -f "${browser_output}" "${browser_error}"

test -w "${workspace}"
printf 'ok\n' >"${workspace}/.harakiri-browser-chromium-smoke"
grep -q "ok" "${workspace}/.harakiri-browser-chromium-smoke"

echo "harakiri browser-chromium smoke passed"
