#!/usr/bin/env bash
set -euo pipefail

workspace="${OPEN_HARAKIRI_WORKSPACE:-/workspace}"

required_commands=(
  bash
  curl
  git
  jq
  node
  npm
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

node - <<'JS'
const assert = require("node:assert/strict");
assert.equal([1, 2, 3].reduce((sum, value) => sum + value, 0), 6);
console.log("node runtime ok");
JS

test -w "${workspace}"
printf 'ok\n' >"${workspace}/.harakiri-node-app-smoke"
grep -q "ok" "${workspace}/.harakiri-node-app-smoke"

echo "harakiri node-app smoke passed"
