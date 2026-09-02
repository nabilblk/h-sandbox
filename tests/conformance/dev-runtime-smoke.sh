#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_PORT="${HARAKIRI_DEV_CONFORMANCE_PORT:-19082}"
API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:${API_PORT}}"
API_KEY="${HARAKIRI_API_KEY:-hk_live_demo_lyra_labs_0000000000000000000000000000000000}"
DATABASE_URL="${DATABASE_URL:-postgres://harakiri:harakiri@127.0.0.1:15432/harakiri}"
API_LOG="$(mktemp)"
API_PID=""

cleanup() {
  set +e
  if [[ -n "${API_PID}" ]]; then
    kill "${API_PID}" >/dev/null 2>&1 || true
    wait "${API_PID}" >/dev/null 2>&1 || true
  fi
  rm -f "${API_LOG}"
}
trap cleanup EXIT

wait_for_database() {
  for _ in {1..30}; do
    if DATABASE_URL="${DATABASE_URL}" node --input-type=module <<'NODE' >/dev/null 2>&1; then
import net from "node:net";
const database = new URL(process.env.DATABASE_URL);
const socket = net.createConnection({
  host: database.hostname,
  port: Number(database.port || 5432),
  timeout: 1000
});
await new Promise((resolve, reject) => {
  socket.once("connect", resolve);
  socket.once("timeout", () => reject(new Error("timeout")));
  socket.once("error", reject);
});
socket.end();
NODE
      return 0
    fi
    sleep 1
  done
  echo "database did not become reachable at ${DATABASE_URL}" >&2
  return 1
}

wait_for_api() {
  for _ in {1..60}; do
    if curl -fsS "${API_URL}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "API did not become healthy at ${API_URL}" >&2
  tail -n 80 "${API_LOG}" >&2 || true
  return 1
}

export DATABASE_URL
wait_for_database

pnpm --dir "${ROOT}" --filter @harakiri/api build
pnpm --dir "${ROOT}" --filter @harakiri/api db:migrate
pnpm --dir "${ROOT}" --filter @harakiri/api db:seed

(
  cd "${ROOT}"
  API_PORT="${API_PORT}" \
    API_HOST=127.0.0.1 \
    PUBLIC_API_URL="${API_URL}" \
    HARAKIRI_RUNTIME_PROVIDER=dev \
    RUNTIME_PROVIDER=dev \
    AUTH_DEV_ALLOW=1 \
    AUTO_MIGRATE=0 \
    SEED_ON_BOOT=0 \
    OPEN_SANDBOX_ALLOW_FALLBACK=0 \
    SANDBOX_ROUTE_PUBLIC_SCHEME=http \
    SANDBOX_ROUTE_BASE_DOMAIN=dev.localhost \
    pnpm --filter @harakiri/api start
) >"${API_LOG}" 2>&1 &
API_PID="$!"

wait_for_api

HARAKIRI_API_URL="${API_URL}" \
  HARAKIRI_API_KEY="${API_KEY}" \
  HARAKIRI_CONFORMANCE_CREATE_WAIT=1 \
  HARAKIRI_CONFORMANCE_ROUTE_BASE_URL="${API_URL}" \
  HARAKIRI_CONFORMANCE_ROUTE_FETCH=0 \
  pnpm --dir "${ROOT}" conformance:sdk

HARAKIRI_API_URL="${API_URL}" \
  HARAKIRI_API_KEY="${API_KEY}" \
  HARAKIRI_CONFORMANCE_ROUTE_BASE_URL="${API_URL}" \
  HARAKIRI_CONFORMANCE_ROUTE_FETCH=0 \
  pnpm --dir "${ROOT}" conformance:cli

echo "dev runtime conformance passed"
