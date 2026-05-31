#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
PACK_DIR="${TMP_DIR}/packages"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

mkdir -p "${PACK_DIR}"

cd "${ROOT}"
pnpm --filter @h-sandbox/sdk build
pnpm --filter @h-sandbox/cli build
pnpm package:assert
pnpm --filter @h-sandbox/sdk pack --pack-destination "${PACK_DIR}" >/dev/null
pnpm --filter @h-sandbox/cli pack --pack-destination "${PACK_DIR}" >/dev/null

SDK_TGZ="$(find "${PACK_DIR}" -name 'h-sandbox-sdk-*.tgz' -print -quit)"
CLI_TGZ="$(find "${PACK_DIR}" -name 'h-sandbox-cli-*.tgz' -print -quit)"

if [[ -z "${SDK_TGZ}" || -z "${CLI_TGZ}" ]]; then
  echo "expected SDK and CLI tarballs in ${PACK_DIR}" >&2
  exit 1
fi

inspect_tarball() {
  local tgz="$1"
  local name="$2"
  local package_json
  package_json="$(tar -xOf "${tgz}" package/package.json)"
  if grep -q '@harakiri/shared' <<<"${package_json}"; then
    echo "${name} package.json must not reference @harakiri/shared" >&2
    exit 1
  fi
  if grep -q 'workspace:' <<<"${package_json}"; then
    echo "${name} package.json must not contain workspace dependencies after packing" >&2
    exit 1
  fi
  if tar -tzf "${tgz}" | grep -E '(^package/src/|\.test\.|^package/tsconfig\.json$|^package/scripts/)' >/dev/null; then
    echo "${name} tarball contains source, tests, scripts, or tsconfig" >&2
    tar -tzf "${tgz}" | grep -E '(^package/src/|\.test\.|^package/tsconfig\.json$|^package/scripts/)'
    exit 1
  fi
  if ! tar -tzf "${tgz}" | grep -Fx 'package/LICENSE' >/dev/null; then
    echo "${name} tarball must include LICENSE" >&2
    exit 1
  fi
}

inspect_tarball "${SDK_TGZ}" "SDK"
inspect_tarball "${CLI_TGZ}" "CLI"

SDK_PROJECT="${TMP_DIR}/sdk-consumer"
mkdir -p "${SDK_PROJECT}"
cd "${SDK_PROJECT}"
npm init -y >/dev/null
npm pkg set type=module >/dev/null
npm install "${SDK_TGZ}" typescript@^5.9.3 @types/node@^24 >/dev/null
if npm ls @harakiri/shared >/dev/null 2>&1; then
  echo "SDK install unexpectedly pulled @harakiri/shared" >&2
  exit 1
fi
cat >tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true
  }
}
JSON
cp "${ROOT}/examples/sdk-typescript-quickstart/index.ts" index.ts
./node_modules/.bin/tsc --noEmit
node -e 'import("@h-sandbox/sdk").then((sdk) => { if (!sdk.HarakiriClient) process.exit(1); })'

CLI_PREFIX="${TMP_DIR}/cli-prefix"
npm install --global --prefix "${CLI_PREFIX}" "${SDK_TGZ}" "${CLI_TGZ}" >/dev/null
if npm ls --global --prefix "${CLI_PREFIX}" @harakiri/shared >/dev/null 2>&1; then
  echo "CLI install unexpectedly pulled @harakiri/shared" >&2
  exit 1
fi
"${CLI_PREFIX}/bin/harakiri" --version >/dev/null
"${CLI_PREFIX}/bin/harakiri" --help >/dev/null

echo "npm package smoke passed"
