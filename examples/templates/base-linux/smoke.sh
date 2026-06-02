#!/usr/bin/env bash
set -euo pipefail

workspace="${OPEN_HARAKIRI_WORKSPACE:-/workspace}"

required_commands=(
  bash
  curl
  find
  git
  grep
  jq
  python3
  rg
  sed
  tar
)

for command_name in "${required_commands[@]}"; do
  command -v "${command_name}" >/dev/null
done

bash --version | head -n 1
python3 --version
git --version
jq --version
rg --version | head -n 1

test -w "${workspace}"
printf 'ok\n' >"${workspace}/.harakiri-base-linux-smoke"
grep -q "ok" "${workspace}/.harakiri-base-linux-smoke"

echo "harakiri base-linux smoke passed"
