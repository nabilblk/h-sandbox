#!/usr/bin/env bash
set -euo pipefail

API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
KEYCLOAK_URL="${HARAKIRI_KEYCLOAK_URL:-${KEYCLOAK_URL:-http://127.0.0.1:18084}}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-harakiri}"
KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-harakiri-web}"
KEYCLOAK_USER="${KEYCLOAK_USER:-lyra@k.ai}"
KEYCLOAK_PASSWORD="${KEYCLOAK_PASSWORD:-harakiri-dev}"
KEY_NAME="${HARAKIRI_TEST_KEY_NAME:-smoke-$(date +%s)}"

TOKEN_RESPONSE="$(curl -fsS \
  -H 'content-type: application/x-www-form-urlencoded' \
  -d "grant_type=password" \
  -d "client_id=${KEYCLOAK_CLIENT_ID}" \
  -d "username=${KEYCLOAK_USER}" \
  -d "password=${KEYCLOAK_PASSWORD}" \
  "${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token")"

ACCESS_TOKEN="$(node -e "const r=JSON.parse(process.argv[1]); console.log(r.access_token)" "${TOKEN_RESPONSE}")"
KEY_BODY="$(KEY_NAME="${KEY_NAME}" node --input-type=module -e '
  const scopes = ["sandboxes:read", "sandboxes:write", "templates:read", "templates:write", "workspaces:read", "workspaces:write", "credentials:use", "org:read"];
  const extras = (process.env.HARAKIRI_TEST_KEY_EXTRA_SCOPES || "").split(",").map(s => s.trim()).filter(Boolean);
  console.log(JSON.stringify({ name: process.env.KEY_NAME, scopes: [...new Set([...scopes, ...extras])], expiresAt: new Date(Date.now() + 86400000).toISOString() }));
')"
KEY_RESPONSE="$(curl -fsS \
  -H "authorization: Bearer ${ACCESS_TOKEN}" \
  -H 'content-type: application/json' \
  -d "${KEY_BODY}" \
  "${API_URL}/v1/api-keys")"

node -e "const key=JSON.parse(process.argv[1]); console.log('HARAKIRI_API_KEY='+JSON.stringify(key.token)); console.log('HARAKIRI_API_KEY_ID='+JSON.stringify(key.key.id)); console.log('HARAKIRI_ACCESS_TOKEN='+JSON.stringify(process.argv[2]));" "${KEY_RESPONSE}" "${ACCESS_TOKEN}"
