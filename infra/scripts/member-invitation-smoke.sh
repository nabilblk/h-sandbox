#!/usr/bin/env bash
set -euo pipefail

API_URL="${HARAKIRI_API_URL:-http://127.0.0.1:18082}"
KEYCLOAK_URL="${HARAKIRI_KEYCLOAK_URL:-http://127.0.0.1:18084}"
MAILPIT_URL="${HARAKIRI_MAILPIT_URL:-http://127.0.0.1:18086}"
REALM="${KEYCLOAK_REALM:-harakiri}"
CLIENT_ID="${KEYCLOAK_CLIENT_ID:-harakiri-web}"
ADMIN_USER="${KEYCLOAK_USER:-lyra@k.ai}"
ADMIN_PASSWORD="${KEYCLOAK_PASSWORD:-harakiri-dev}"
KC_ADMIN_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}"
KC_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
STAMP="$(date +%s)"
INVITE_EMAIL="invite-smoke-${STAMP}@example.com"
MEMBER_EMAIL="member-smoke-${STAMP}@example.com"
MEMBER_PASSWORD="harakiri-dev-${STAMP}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required command: $1" >&2
    exit 2
  }
}

token_for() {
  local username="$1"
  local password="$2"
  curl -fsS \
    -d "client_id=${CLIENT_ID}" \
    -d "username=${username}" \
    -d "password=${password}" \
    -d "grant_type=password" \
    "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" | jq -r .access_token
}

admin_token() {
  curl -fsS \
    -d client_id=admin-cli \
    -d "username=${KC_ADMIN_USER}" \
    -d "password=${KC_ADMIN_PASSWORD}" \
    -d grant_type=password \
    "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" | jq -r .access_token
}

need curl
need jq

ADMIN_TOKEN="$(token_for "${ADMIN_USER}" "${ADMIN_PASSWORD}")"
ADMIN_CAPABILITY="$(curl -fsS -H "authorization: Bearer ${ADMIN_TOKEN}" "${API_URL}/v1/me" | jq -r '.role + ":" + (.capabilities.canManageMembers|tostring)')"
test "${ADMIN_CAPABILITY}" = "admin:true"

INVITE_BODY="$(curl -fsS \
  -H "authorization: Bearer ${ADMIN_TOKEN}" \
  -H "content-type: application/json" \
  -d "{\"email\":\"${INVITE_EMAIL}\"}" \
  "${API_URL}/v1/org/invitations")"
test "$(jq -r '.member.status' <<<"${INVITE_BODY}")" = "sent"
INVITE_ID="$(jq -r '.member.invitationId' <<<"${INVITE_BODY}")"
test -n "${INVITE_ID}"

if curl -fsS "${MAILPIT_URL}/api/v1/messages?query=${INVITE_EMAIL}" >/tmp/harakiri-member-mailpit.json 2>/dev/null; then
  test "$(jq -r '.total' /tmp/harakiri-member-mailpit.json)" -ge 1
fi

CANCEL_BODY="$(curl -fsS -X POST \
  -H "authorization: Bearer ${ADMIN_TOKEN}" \
  "${API_URL}/v1/org/invitations/${INVITE_ID}/cancel")"
test "$(jq -r '.member.status' <<<"${CANCEL_BODY}")" = "canceled"

KC_ADMIN_TOKEN="$(admin_token)"
curl -fsS -o /dev/null -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
  -H "authorization: Bearer ${KC_ADMIN_TOKEN}" \
  -H "content-type: application/json" \
  -d "{\"username\":\"${MEMBER_EMAIL}\",\"email\":\"${MEMBER_EMAIL}\",\"enabled\":true,\"emailVerified\":true,\"firstName\":\"Member\",\"lastName\":\"Smoke\"}" || true
MEMBER_ID="$(curl -fsS -G "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
  -H "authorization: Bearer ${KC_ADMIN_TOKEN}" \
  --data-urlencode "email=${MEMBER_EMAIL}" \
  --data-urlencode exact=true | jq -r '.[0].id')"
test -n "${MEMBER_ID}"

curl -fsS -o /dev/null -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${MEMBER_ID}/reset-password" \
  -H "authorization: Bearer ${KC_ADMIN_TOKEN}" \
  -H "content-type: application/json" \
  -d "{\"type\":\"password\",\"value\":\"${MEMBER_PASSWORD}\",\"temporary\":false}"

MEMBER_BODY="$(curl -fsS \
  -H "authorization: Bearer ${ADMIN_TOKEN}" \
  -H "content-type: application/json" \
  -d "{\"email\":\"${MEMBER_EMAIL}\"}" \
  "${API_URL}/v1/org/invitations")"
test "$(jq -r '.member.kind' <<<"${MEMBER_BODY}")" = "member"
test "$(jq -r '.member.status' <<<"${MEMBER_BODY}")" = "active"
MEMBERSHIP_ID="$(jq -r '.member.membershipId' <<<"${MEMBER_BODY}")"
test -n "${MEMBERSHIP_ID}"

MEMBER_TOKEN="$(token_for "${MEMBER_EMAIL}" "${MEMBER_PASSWORD}")"
MEMBER_CAPABILITY="$(curl -fsS -H "authorization: Bearer ${MEMBER_TOKEN}" "${API_URL}/v1/me" | jq -r '.role + ":" + (.capabilities.canManageMembers|tostring)')"
test "${MEMBER_CAPABILITY}" = "member:false"

MEMBER_STATUS="$(curl -sS -o /tmp/harakiri-member-forbidden.json -w '%{http_code}' -H "authorization: Bearer ${MEMBER_TOKEN}" "${API_URL}/v1/org/members")"
test "${MEMBER_STATUS}" = "403"
test "$(jq -r '.error' /tmp/harakiri-member-forbidden.json)" = "forbidden"

REMOVE_BODY="$(curl -fsS -X DELETE \
  -H "authorization: Bearer ${ADMIN_TOKEN}" \
  "${API_URL}/v1/org/members/${MEMBERSHIP_ID}")"
test "$(jq -r '.member.membershipId' <<<"${REMOVE_BODY}")" = "${MEMBERSHIP_ID}"

echo "member invitation smoke passed"
