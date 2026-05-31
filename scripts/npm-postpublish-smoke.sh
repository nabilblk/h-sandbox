#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${HARAKIRI_PUBLISH_VERSION:-$(node -e "console.log(require('${ROOT}/packages/sdk/package.json').version)")}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

echo "verifying @harakiri/sdk@${VERSION} and @harakiri/cli@${VERSION} from npm"

SDK_VERSION="$(npm view "@harakiri/sdk@${VERSION}" version)"
CLI_VERSION="$(npm view "@harakiri/cli@${VERSION}" version)"

if [[ "${SDK_VERSION}" != "${VERSION}" ]]; then
  echo "expected @harakiri/sdk@${VERSION}, got ${SDK_VERSION}" >&2
  exit 1
fi
if [[ "${CLI_VERSION}" != "${VERSION}" ]]; then
  echo "expected @harakiri/cli@${VERSION}, got ${CLI_VERSION}" >&2
  exit 1
fi

SDK_PROJECT="${TMP_DIR}/sdk-consumer"
mkdir -p "${SDK_PROJECT}"
cd "${SDK_PROJECT}"
npm init -y >/dev/null
npm pkg set type=module >/dev/null
npm install "@harakiri/sdk@${VERSION}" typescript@^5.9.3 @types/node@^24 >/dev/null
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
node -e 'import("@harakiri/sdk").then((sdk) => { if (!sdk.HarakiriClient) process.exit(1); })'

CLI_PREFIX="${TMP_DIR}/cli-prefix"
npm install --global --prefix "${CLI_PREFIX}" "@harakiri/cli@${VERSION}" >/dev/null
if npm ls --global --prefix "${CLI_PREFIX}" @harakiri/shared >/dev/null 2>&1; then
  echo "CLI install unexpectedly pulled @harakiri/shared" >&2
  exit 1
fi
"${CLI_PREFIX}/bin/harakiri" --version >/dev/null
"${CLI_PREFIX}/bin/harakiri" --help >/dev/null

echo "npm post-publish smoke passed for ${VERSION}"
